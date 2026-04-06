const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
const axios = require('axios');

const config = require('./config.json');
const db = require('./database');
const botEngine = require('./bot/engine');
const deltaApi = require('./bot/delta-api');
const strategyManager = require('./bot/strategies');
const riskManager = require('./bot/risk-manager');

// Cache public IPv6 so we don't fetch it every request
let cachedPublicIpv6 = null;
let ipv6LastFetch = 0;

async function getPublicIPv6() {
    // Cache for 5 minutes
    if (cachedPublicIpv6 && (Date.now() - ipv6LastFetch) < 300000) {
        return cachedPublicIpv6;
    }
    
    // Try multiple services to get the real public IPv6
    const services = [
        'https://api6.ipify.org?format=text',
        'https://v6.ident.me',
        'https://ipv6.icanhazip.com'
    ];
    
    for (const url of services) {
        try {
            const res = await axios.get(url, { timeout: 5000, family: 6 });
            const ip = (res.data || '').toString().trim();
            if (ip && ip.includes(':')) {
                cachedPublicIpv6 = ip;
                ipv6LastFetch = Date.now();
                console.log(`[IPv6] Public address: ${ip} (from ${url})`);
                return ip;
            }
        } catch (e) {
            // Try next service
        }
    }
    
    // Fallback: try local interfaces if external services fail
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv6' && !iface.internal && !iface.address.startsWith('fe80')) {
                return iface.address;
            }
        }
    }
    
    return 'Not available';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect Socket.IO to bot engine
botEngine.setIO(io);

// ============ REST API ============

// --- Bot Control ---
app.post('/api/bot/start', async (req, res) => {
    try {
        await botEngine.start();
        res.json({ success: true, status: botEngine.getStatus() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/bot/stop', (req, res) => {
    botEngine.stop();
    res.json({ success: true, status: botEngine.getStatus() });
});

app.get('/api/bot/status', (req, res) => {
    res.json(botEngine.getStatus());
});

// --- Dashboard Data ---
app.get('/api/dashboard', async (req, res) => {
    try {
        const stats = db.getTradeStats();
        const dailyStats = db.getTodayStats();
        const settings = riskManager.getSettings();
        const openTrades = db.getOpenTrades();

        let balance = { available: 0, balance: 0, locked: 0, unrealizedPnl: 0 };
        try {
            const apiKey = db.getEncryptedSetting('api_key');
            const apiSecret = db.getEncryptedSetting('api_secret');
            if (apiKey && apiSecret) {
                deltaApi.setCredentials(apiKey, apiSecret);
                balance = await deltaApi.getBalance(settings.currency);
            }
        } catch (e) {
            // Balance fetch failed silently
        }

        const budgetInfo = riskManager.getBudgetInfo(balance.balance || balance.available);

        res.json({
            balance,
            stats,
            dailyStats,
            budgetInfo,
            openTrades,
            settings: {
                minBalance: settings.minBalance,
                minPrice: settings.minPrice,
                maxPrice: settings.maxPrice,
                currency: settings.currency
            },
            botStatus: botEngine.getStatus()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Strategies ---
app.get('/api/strategies', (req, res) => {
    res.json(strategyManager.getAllStrategies());
});

app.post('/api/strategies/select', (req, res) => {
    try {
        const { strategyId } = req.body;
        const info = strategyManager.setActiveStrategy(strategyId);
        db.setSetting('active_strategy', strategyId);
        io.emit('bot:strategy', info);
        res.json({ success: true, strategy: info });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// --- Market Data ---
app.get('/api/market/tickers', async (req, res) => {
    try {
        const apiKey = db.getEncryptedSetting('api_key');
        const apiSecret = db.getEncryptedSetting('api_secret');
        if (apiKey && apiSecret) deltaApi.setCredentials(apiKey, apiSecret);

        const tickers = await deltaApi.getTickers();
        const products = await deltaApi.getProducts();

        // Enrich tickers with product info
        const enriched = tickers.map(t => {
            const product = products.find(p => p.symbol === t.symbol);
            return {
                symbol: t.symbol,
                price: parseFloat(t.mark_price || t.close || 0),
                open: parseFloat(t.open || 0),
                high: parseFloat(t.high || 0),
                low: parseFloat(t.low || 0),
                close: parseFloat(t.close || 0),
                volume: parseFloat(t.volume || 0),
                turnover: parseFloat(t.turnover || 0),
                change24h: t.close && t.open ? (((parseFloat(t.close) - parseFloat(t.open)) / parseFloat(t.open)) * 100) : 0,
                product_id: product?.id,
                contract_type: product?.contract_type,
                description: product?.description,
                quoting_asset: product?.quoting_asset?.symbol,
                settling_asset: product?.settling_asset?.symbol
            };
        }).filter(t => t.price > 0);

        res.json(enriched);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Trades ---
app.get('/api/trades', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const trades = db.getTradeHistory(limit);
    const stats = db.getTradeStats();
    res.json({ trades, stats });
});

app.delete('/api/trades/history', (req, res) => {
    db.clearTradeHistory();
    res.json({ success: true, message: 'Trade history cleared' });
});

// --- Logs ---
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const logs = db.getLogs(limit);
    res.json(logs);
});

app.delete('/api/logs', (req, res) => {
    db.clearLogs();
    res.json({ success: true });
});

// --- Settings ---
app.get('/api/settings', async (req, res) => {
    const settings = db.getAllSettings();
    const strategies = strategyManager.getAllStrategies();

    // Get REAL public IPv6 address (not local interface)
    const ipv6 = await getPublicIPv6();

    // API connection test
    const apiKey = db.getEncryptedSetting('api_key');
    const hasApi = !!apiKey;

    res.json({
        ...settings,
        ipv6,
        apiConnected: hasApi,
        botVersion: config.bot.version,
        strategyCount: strategies.length,
        strategies
    });
});

app.post('/api/settings', (req, res) => {
    const { key, value } = req.body;
    const encryptedKeys = ['api_key', 'api_secret'];

    if (encryptedKeys.includes(key)) {
        db.setEncryptedSetting(key, value);
    } else {
        db.setSetting(key, value.toString());
    }

    res.json({ success: true });
});

app.post('/api/settings/bulk', (req, res) => {
    const settings = req.body;
    const encryptedKeys = ['api_key', 'api_secret'];

    for (const [key, value] of Object.entries(settings)) {
        if (value === undefined || value === null) continue;
        if (encryptedKeys.includes(key) && value !== '••••••••') {
            // Trim whitespace/invisible chars from API keys
            const trimmed = value.toString().trim();
            console.log(`[SAVE] ${key}: length=${trimmed.length}, first6=${trimmed.substring(0, 6)}...`);
            db.setEncryptedSetting(key, trimmed);
        } else if (!encryptedKeys.includes(key)) {
            db.setSetting(key, value.toString());
        }
    }

    res.json({ success: true });
});

app.post('/api/settings/test-connection', async (req, res) => {
    try {
        const apiKey = db.getEncryptedSetting('api_key');
        const apiSecret = db.getEncryptedSetting('api_secret');

        if (!apiKey || !apiSecret) {
            return res.json({ connected: false, error: 'API credentials not configured. Please save your API Key and Secret first.' });
        }

        console.log('\n========== CONNECTION TEST ==========');
        console.log(`API Key decrypted: ${apiKey.substring(0, 8)}... (length: ${apiKey.length})`);
        console.log(`API Secret decrypted: ${apiSecret.substring(0, 4)}... (length: ${apiSecret.length})`);
        console.log(`Base URL: ${deltaApi.baseUrl}`);
        console.log('=====================================\n');

        deltaApi.setCredentials(apiKey, apiSecret);
        const result = await deltaApi.testConnection();
        res.json(result);
    } catch (error) {
        console.error('[TEST-CONNECTION ERROR]', error);
        res.json({ connected: false, error: error.message });
    }
});

// --- Balance for Settings Page ---
app.get('/api/balance', async (req, res) => {
    try {
        const apiKey = db.getEncryptedSetting('api_key');
        const apiSecret = db.getEncryptedSetting('api_secret');
        if (!apiKey || !apiSecret) {
            return res.json({ available: 0, balance: 0, locked: 0, unrealizedPnl: 0, assetSymbol: '' });
        }
        deltaApi.setCredentials(apiKey, apiSecret);
        // Use query param currency if provided, else fallback to saved setting
        const currency = req.query.currency || db.getSetting('currency', 'INR');
        const balance = await deltaApi.getBalance(currency);
        const budgetInfo = riskManager.getBudgetInfo(balance.balance);
        res.json({ ...balance, budgetInfo });
    } catch (error) {
        console.error('[BALANCE ERROR]', error.message);
        res.json({ available: 0, balance: 0, locked: 0, unrealizedPnl: 0, assetSymbol: '', error: error.message });
    }
});

// --- Save All Settings ---
app.post('/api/settings/save-all', (req, res) => {
    const settings = req.body;
    const encryptedKeys = ['api_key', 'api_secret'];
    let saved = 0;

    for (const [key, value] of Object.entries(settings)) {
        if (value === undefined || value === null || value === '') continue;
        if (encryptedKeys.includes(key) && value !== '••••••••') {
            const trimmed = value.toString().trim();
            db.setEncryptedSetting(key, trimmed);
            saved++;
        } else if (!encryptedKeys.includes(key)) {
            db.setSetting(key, value.toString());
            saved++;
        }
    }

    console.log(`[SETTINGS] Saved ${saved} settings`);
    res.json({ success: true, saved });
});

// --- System Info ---
app.get('/api/system/ipv6', async (req, res) => {
    const ipv6 = await getPublicIPv6();
    res.json({ ipv6 });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ WebSocket ============
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Send current status on connect
    socket.emit('bot:status', botEngine.getStatus());

    // Send recent logs
    const logs = db.getLogs(20);
    socket.emit('bot:logs', logs);

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ============ Start Server ============
const PORT = process.env.PORT || config.server.port || 3000;
const HOST = config.server.host || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║                                          ║');
    console.log('  ║   🤖 CryptoBOT Delta v1.0.0              ║');
    console.log('  ║   Delta Exchange India Trading Bot        ║');
    console.log('  ║                                          ║');
    console.log(`  ║   🌐 http://localhost:${PORT}               ║`);
    console.log('  ║                                          ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
    console.log(`  📊 Strategies: ${strategyManager.getCount()}`);
    console.log(`  💾 Database: Ready`);
    console.log(`  🔌 WebSocket: Ready`);
    console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    botEngine.stop();
    db.close();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    botEngine.stop();
    db.close();
    server.close();
    process.exit(0);
});
