const initSqlJs = require('sql.js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'bot.db');
const ENCRYPTION_KEY = crypto.scryptSync('CryptoBOT-Delta-Secure-2024', 'salt-delta-bot', 32);

class BotDatabase {
    constructor() {
        this.db = null;
        this._ready = false;
    }

    /**
     * Initialize the database (async — must be called before using any methods)
     */
    async init() {
        const SQL = await initSqlJs();

        // Load existing database if it exists
        if (fs.existsSync(DB_PATH)) {
            const fileBuffer = fs.readFileSync(DB_PATH);
            this.db = new SQL.Database(fileBuffer);
        } else {
            this.db = new SQL.Database();
        }

        this.migrate();
        this._ready = true;
        return this;
    }

    /**
     * Save database to disk
     */
    _save() {
        if (!this.db) return;
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }

    migrate() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id TEXT UNIQUE,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                order_type TEXT NOT NULL,
                price REAL NOT NULL,
                quantity REAL NOT NULL,
                pnl REAL DEFAULT 0,
                strategy TEXT,
                status TEXT DEFAULT 'open',
                entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                exit_time DATETIME,
                exit_price REAL,
                fees REAL DEFAULT 0,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT DEFAULT 'info',
                message TEXT NOT NULL,
                data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS daily_stats (
                date TEXT PRIMARY KEY,
                total_trades INTEGER DEFAULT 0,
                win_trades INTEGER DEFAULT 0,
                loss_trades INTEGER DEFAULT 0,
                total_pnl REAL DEFAULT 0,
                total_loss REAL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indexes individually (sql.js handles CREATE INDEX IF NOT EXISTS)
        try { this.db.run('CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)'); } catch(e) {}
        try { this.db.run('CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status)'); } catch(e) {}
        try { this.db.run('CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time)'); } catch(e) {}
        try { this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)'); } catch(e) {}

        this._save();
    }

    // === Encryption ===
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag();
        return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
    }

    decrypt(encryptedText) {
        try {
            const parts = encryptedText.split(':');
            if (parts.length !== 3) return encryptedText;
            const iv = Buffer.from(parts[0], 'hex');
            const tag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];
            const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
            decipher.setAuthTag(tag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            return encryptedText;
        }
    }

    // === Helper: run a SELECT and return all rows ===
    _all(sql, params = []) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
    }

    // === Helper: run a SELECT and return first row ===
    _get(sql, params = []) {
        const rows = this._all(sql, params);
        return rows.length > 0 ? rows[0] : null;
    }

    // === Helper: run an INSERT/UPDATE/DELETE ===
    _run(sql, params = []) {
        this.db.run(sql, params);
        this._save();
    }

    // === Settings ===
    getSetting(key, defaultValue = null) {
        const row = this._get('SELECT value FROM settings WHERE key = ?', [key]);
        return row ? row.value : defaultValue;
    }

    setSetting(key, value) {
        this._run(`
            INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
        `, [key, value, value]);
    }

    getEncryptedSetting(key) {
        const val = this.getSetting(key);
        return val ? this.decrypt(val) : null;
    }

    setEncryptedSetting(key, value) {
        this.setSetting(key, this.encrypt(value));
    }

    getAllSettings() {
        const rows = this._all('SELECT key, value FROM settings');
        const settings = {};
        const encryptedKeys = ['api_key', 'api_secret'];
        for (const row of rows) {
            if (encryptedKeys.includes(row.key)) {
                settings[row.key] = '••••••••';
            } else {
                settings[row.key] = row.value;
            }
        }
        return settings;
    }

    // === Trades ===
    addTrade(trade) {
        this._run(`
            INSERT INTO trades (trade_id, symbol, side, order_type, price, quantity, strategy, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            trade.trade_id || `T${Date.now()}`,
            trade.symbol,
            trade.side,
            trade.order_type || 'market',
            trade.price,
            trade.quantity,
            trade.strategy || 'manual',
            trade.status || 'open',
            trade.notes || ''
        ]);
    }

    closeTrade(tradeId, exitPrice, pnl, fees = 0) {
        this._run(`
            UPDATE trades SET status = 'closed', exit_price = ?, pnl = ?, fees = ?, exit_time = datetime('now')
            WHERE id = ? AND status = 'open'
        `, [exitPrice, pnl, fees, tradeId]);
    }

    getOpenTrades() {
        return this._all('SELECT * FROM trades WHERE status = ? ORDER BY entry_time DESC', ['open']);
    }

    getTradeHistory(limit = 100) {
        return this._all('SELECT * FROM trades ORDER BY entry_time DESC LIMIT ?', [limit]);
    }

    getTradeStats() {
        const total = this._get('SELECT COUNT(*) as count FROM trades');
        const closed = this._get('SELECT COUNT(*) as count FROM trades WHERE status = ?', ['closed']);
        const wins = this._get('SELECT COUNT(*) as count FROM trades WHERE status = ? AND pnl > 0', ['closed']);
        const losses = this._get('SELECT COUNT(*) as count FROM trades WHERE status = ? AND pnl <= 0', ['closed']);
        const totalPnl = this._get('SELECT COALESCE(SUM(pnl), 0) as total FROM trades WHERE status = ?', ['closed']);
        const openCount = this._get('SELECT COUNT(*) as count FROM trades WHERE status = ?', ['open']);
        
        return {
            totalTrades: total.count,
            closedTrades: closed.count,
            openTrades: openCount.count,
            winTrades: wins.count,
            lossTrades: losses.count,
            totalPnl: totalPnl.total,
            winRate: closed.count > 0 ? ((wins.count / closed.count) * 100).toFixed(1) : '0.0'
        };
    }

    clearTradeHistory() {
        this._run('DELETE FROM trades WHERE status = ?', ['closed']);
    }

    // === Daily Stats ===
    getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        let stats = this._get('SELECT * FROM daily_stats WHERE date = ?', [today]);
        if (!stats) {
            this._run('INSERT OR IGNORE INTO daily_stats (date) VALUES (?)', [today]);
            stats = { date: today, total_trades: 0, win_trades: 0, loss_trades: 0, total_pnl: 0, total_loss: 0 };
        }
        return stats;
    }

    updateDailyStats(isWin, pnl) {
        const today = new Date().toISOString().split('T')[0];
        this._run('INSERT OR IGNORE INTO daily_stats (date) VALUES (?)', [today]);
        
        if (isWin) {
            this._run(`
                UPDATE daily_stats SET total_trades = total_trades + 1, win_trades = win_trades + 1, 
                total_pnl = total_pnl + ?, updated_at = datetime('now') WHERE date = ?
            `, [pnl, today]);
        } else {
            this._run(`
                UPDATE daily_stats SET total_trades = total_trades + 1, loss_trades = loss_trades + 1,
                total_pnl = total_pnl + ?, total_loss = total_loss + ?, updated_at = datetime('now') WHERE date = ?
            `, [pnl, Math.abs(pnl), today]);
        }
    }

    // Increment trade count when order is placed (without PnL)
    updateDailyTradeCount() {
        const today = new Date().toISOString().split('T')[0];
        this._run('INSERT OR IGNORE INTO daily_stats (date) VALUES (?)', [today]);
        this._run(`UPDATE daily_stats SET total_trades = total_trades + 1, updated_at = datetime('now') WHERE date = ?`, [today]);
    }

    // === Logs ===
    addLog(level, message, data = null) {
        this._run('INSERT INTO logs (level, message, data) VALUES (?, ?, ?)', [
            level, message, data ? JSON.stringify(data) : null
        ]);
        // Keep only last 1000 logs
        this._run('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 1000)');
    }

    getLogs(limit = 50) {
        return this._all('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit]);
    }

    clearLogs() {
        this._run('DELETE FROM logs');
    }

    close() {
        if (this.db) {
            this._save();
            this.db.close();
        }
    }
}

// Export a singleton instance — but it needs async init
const instance = new BotDatabase();
module.exports = instance;
