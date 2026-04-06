/**
 * Trades Module - Trade history page with real-time updates
 */
const Trades = {
    trades: [],
    stats: {},

    async init() {
        await this.loadTrades();
        this.setupWebSocket();
    },

    async loadTrades() {
        try {
            const res = await fetch('/api/trades?limit=200');
            const data = await res.json();
            this.trades = data.trades || [];
            this.stats = data.stats || {};
            this.render();
        } catch (error) {
            console.error('Failed to load trades:', error);
        }
    },

    render() {
        this.renderStats();
        this.renderList();
    },

    renderStats() {
        const currency = document.getElementById('statCurrency')?.textContent || 'INR';
        const sym = currency === 'INR' ? '₹' : (currency === 'BTC' ? '₿' : '$');

        document.getElementById('tradeTotal').textContent = this.stats.totalTrades || 0;
        document.getElementById('tradeWins').textContent = this.stats.winTrades || 0;
        document.getElementById('tradeLosses').textContent = this.stats.lossTrades || 0;

        const pnl = this.stats.totalPnl || 0;
        const pnlEl = document.getElementById('tradePnl');
        pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${sym}${Math.abs(pnl).toFixed(2)}`;
        pnlEl.className = `value ${pnl >= 0 ? 'text-green' : 'text-red'}`;
    },

    renderList() {
        const container = document.getElementById('tradeList');
        const currency = document.getElementById('statCurrency')?.textContent || 'INR';
        const sym = currency === 'INR' ? '₹' : (currency === 'BTC' ? '₿' : '$');

        if (this.trades.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📊</div>
                    <div class="title">No Trades Yet</div>
                    <div class="desc">Bot will record all trades here</div>
                </div>`;
            return;
        }

        container.innerHTML = this.trades.map(t => {
            const time = new Date(t.entry_time).toLocaleString('en-IN', {
                day: '2-digit', month: 'short',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            const pnl = t.pnl || 0;
            const pnlClass = pnl > 0 ? 'positive' : (pnl < 0 ? 'negative' : '');
            const pnlSign = pnl >= 0 ? '+' : '';

            let notes = {};
            try { notes = JSON.parse(t.notes || '{}'); } catch(e) {}

            const statusBadge = t.status === 'open' 
                ? '<span style="color:#00e5ff;font-size:10px;margin-left:4px">● OPEN</span>' 
                : '<span style="color:#666;font-size:10px;margin-left:4px">✓ CLOSED</span>';

            const reason = notes.reason ? `<div class="trade-reason" style="font-size:10px;color:#888;margin-top:2px">${notes.reason}</div>` : '';

            return `
                <div class="trade-entry">
                    <div class="trade-entry-left">
                        <span class="trade-side ${t.side}">${t.side}</span>
                        <div>
                            <div class="trade-symbol">${t.symbol} ${statusBadge}</div>
                            <div class="trade-details">
                                Qty: ${t.quantity} | ${t.strategy || '-'} | ${sym}${parseFloat(t.price).toFixed(2)}
                            </div>
                            ${reason}
                        </div>
                    </div>
                    <div class="trade-entry-right">
                        <div class="trade-pnl ${pnlClass}">${t.status === 'open' ? 'Open' : `${pnlSign}${sym}${Math.abs(pnl).toFixed(2)}`}</div>
                        <div class="trade-time">${time}</div>
                    </div>
                </div>`;
        }).join('');
    },

    async clearHistory() {
        if (!confirm('Are you sure you want to clear all trade history?')) return;
        try {
            await fetch('/api/trades/history', { method: 'DELETE' });
            this.trades = [];
            this.stats = { totalTrades: 0, winTrades: 0, lossTrades: 0, totalPnl: 0, winRate: '0.0' };
            this.render();
            App.showToast('Trade history cleared', 'success');
        } catch (error) {
            App.showToast('Failed to clear history', 'error');
        }
    },

    setupWebSocket() {
        WS.on('botTrade', () => {
            setTimeout(() => this.loadTrades(), 1000);
        });
        WS.on('botRefresh', () => {
            this.loadTrades();
        });
    }
};
