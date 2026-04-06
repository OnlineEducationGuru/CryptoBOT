/**
 * Dashboard Module - Home page logic with real-time updates
 */
const Dashboard = {
    logs: [],
    strategies: [],
    refreshTimer: null,

    // Approximate exchange rates for display conversion
    exchangeRates: {
        'USD_INR': 84, 'INR_USD': 1/84,
        'USDT_INR': 84, 'INR_USDT': 1/84,
        'USD_USDT': 1, 'USDT_USD': 1,
        'BTC_USD': 67000, 'USD_BTC': 1/67000,
        'BTC_INR': 67000 * 84, 'INR_BTC': 1/(67000 * 84)
    },

    async init() {
        await this.loadDashboard();
        await this.loadStrategies();
        this.setupWebSocket();
        // Auto-refresh dashboard every 30 seconds
        this.refreshTimer = setInterval(() => this.loadDashboard(), 30000);
    },

    convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        const key = `${fromCurrency}_${toCurrency}`;
        const rate = this.exchangeRates[key];
        if (rate) return amount * rate;
        // Try reverse
        const revKey = `${toCurrency}_${fromCurrency}`;
        const revRate = this.exchangeRates[revKey];
        if (revRate) return amount / revRate;
        return amount; // No conversion available
    },

    async loadDashboard() {
        try {
            const res = await fetch('/api/dashboard');
            const data = await res.json();

            // Currency setup
            const displayCurrency = data.settings?.currency || 'INR';
            const sym = displayCurrency === 'INR' ? '₹' : (displayCurrency === 'BTC' ? '₿' : '$');
            const actualAsset = data.balance.assetSymbol || displayCurrency;
            
            // Convert balance to display currency if different
            let displayBalance = data.balance.balance || data.balance.available || 0;
            if (actualAsset !== displayCurrency) {
                displayBalance = this.convertCurrency(displayBalance, actualAsset, displayCurrency);
            }

            document.getElementById('statBalance').textContent = `${sym}${this.formatNumber(displayBalance)}`;
            document.getElementById('statCurrency').textContent = displayCurrency;

            // P&L
            const pnl = data.stats.totalPnl || 0;
            const pnlEl = document.getElementById('statPnl');
            pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${sym}${this.formatNumber(Math.abs(pnl))}`;
            pnlEl.className = `stat-value ${pnl >= 0 ? 'positive' : 'negative'}`;

            // Win Rate
            document.getElementById('statWinRate').textContent = `${data.stats.winRate}%`;
            document.getElementById('statTradeCount').textContent = `${data.stats.closedTrades || data.stats.totalTrades} closed`;

            // Additional stats
            document.getElementById('statTotalTrades').textContent = data.stats.totalTrades;
            document.getElementById('statMinBalance').textContent = `${sym}${this.formatNumber(data.settings.minBalance)}`;
            document.getElementById('statPriceRange').textContent = `${sym}${data.settings.minPrice} - ${sym}${this.formatNumber(data.settings.maxPrice)}`;

            // Bot status
            this.updateBotStatus(data.botStatus);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        }
    },

    async loadStrategies() {
        try {
            const res = await fetch('/api/strategies');
            this.strategies = await res.json();
            this.renderStrategies();
        } catch (error) {
            console.error('Failed to load strategies:', error);
        }
    },

    renderStrategies() {
        const container = document.getElementById('strategyList');
        let activeFound = false;

        container.innerHTML = this.strategies.map(s => {
            const isActive = s.active;
            if (isActive) {
                activeFound = true;
                document.getElementById('activeStrategyBadge').textContent = `Win: ${s.winRate}%`;
            }

            const riskClass = s.riskLevel.toLowerCase();

            return `
                <div class="strategy-card ${isActive ? 'active' : ''}" onclick="Dashboard.selectStrategy('${s.id}')" id="strategy-${s.id}">
                    <div class="strategy-radio"></div>
                    <div class="strategy-info">
                        <div class="strategy-name">${s.id === 'multi-ai' ? '🧠 ' : ''}${s.name}</div>
                        <div class="strategy-desc">${s.description}</div>
                        <div class="strategy-meta">
                            <span class="strategy-badge badge-winrate">📊 ${s.winRate}% Win</span>
                            <span class="strategy-badge badge-timeframe">⏱ ${s.timeframe}</span>
                            <span class="strategy-badge badge-${riskClass}">${this.getRiskIcon(s.riskLevel)} ${s.riskLevel}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    getRiskIcon(level) {
        switch (level.toLowerCase()) {
            case 'conservative': return '🟢';
            case 'moderate': return '🟡';
            case 'aggressive': return '🔴';
            default: return '⚪';
        }
    },

    async selectStrategy(id) {
        try {
            const res = await fetch('/api/strategies/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strategyId: id })
            });
            const data = await res.json();
            if (data.success) {
                App.showToast(`Strategy changed to ${data.strategy.name}`, 'success');
                await this.loadStrategies();
            }
        } catch (error) {
            App.showToast('Failed to change strategy', 'error');
        }
    },

    updateBotStatus(status) {
        const btn = document.getElementById('btnBotToggle');
        const btnText = document.getElementById('btnBotText');
        const indicator = document.getElementById('apiStatus');
        const statusText = document.getElementById('apiStatusText');

        if (status.running) {
            btn.className = 'btn-bot-toggle stop';
            btnText.textContent = 'STOP';
            indicator.className = 'status-indicator online';
            statusText.textContent = 'Running';
        } else {
            btn.className = 'btn-bot-toggle start';
            btnText.textContent = 'START';
            indicator.className = 'status-indicator offline';
            statusText.textContent = 'Stopped';
        }
    },

    addLog(entry) {
        this.logs.unshift(entry);
        if (this.logs.length > 100) this.logs.pop();
        this.renderLogs();
    },

    renderLogs() {
        const container = document.getElementById('logContainer');
        if (this.logs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📋</div>
                    <div class="title">No Activity Yet</div>
                    <div class="desc">Start the bot to see live activity logs</div>
                </div>`;
            return;
        }

        const icons = {
            info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌',
            trade: '💰', signal: '📊'
        };

        container.innerHTML = this.logs.map(log => {
            const time = new Date(log.timestamp || log.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            });
            return `
                <div class="log-entry ${log.level}">
                    <span class="log-time">${time}</span>
                    <span class="log-icon">${icons[log.level] || '📋'}</span>
                    <span class="log-message">${log.message}</span>
                </div>`;
        }).join('');
    },

    async clearLogs() {
        try {
            await fetch('/api/logs', { method: 'DELETE' });
            this.logs = [];
            this.renderLogs();
            App.showToast('Logs cleared', 'info');
        } catch (error) {
            App.showToast('Failed to clear logs', 'error');
        }
    },

    setupWebSocket() {
        WS.on('botStatus', (data) => this.updateBotStatus(data));
        WS.on('botLog', (data) => this.addLog(data));
        WS.on('botLogs', (data) => {
            this.logs = data.reverse ? data : [...data].reverse();
            this.renderLogs();
        });
        WS.on('botBalance', (data) => {
            const currency = document.getElementById('statCurrency')?.textContent || 'INR';
            const sym = currency === 'INR' ? '₹' : (currency === 'BTC' ? '₿' : '$');
            const bal = data.balance || data.available || 0;
            document.getElementById('statBalance').textContent = `${sym}${this.formatNumber(bal)}`;
        });
        // Real-time dashboard refresh when trades happen
        WS.on('botTrade', () => {
            setTimeout(() => this.loadDashboard(), 1000);
        });
        WS.on('botRefresh', () => {
            this.loadDashboard();
        });
    },

    formatNumber(num) {
        if (num === null || num === undefined) return '0';
        num = parseFloat(num);
        if (isNaN(num)) return '0';
        if (Math.abs(num) >= 10000000) return (num / 10000000).toFixed(2) + 'Cr';
        if (Math.abs(num) >= 100000) return (num / 100000).toFixed(2) + 'L';
        if (Math.abs(num) >= 1000) return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        return num.toFixed(2);
    }
};
