/**
 * Market Module - Live market data page
 */
const Market = {
    tickers: [],
    filteredTickers: [],
    currentFilter: 'all',
    searchQuery: '',
    refreshTimer: null,

    async init() {
        await this.loadTickers();
        // Auto-refresh every 10 seconds
        this.refreshTimer = setInterval(() => {
            if (document.getElementById('page-market').classList.contains('active')) {
                this.loadTickers();
            }
        }, 10000);
    },

    async loadTickers() {
        try {
            const res = await fetch('/api/market/tickers');
            this.tickers = await res.json();
            this.applyFilter();
        } catch (error) {
            console.error('Failed to load tickers:', error);
        }
    },

    search(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.applyFilter();
    },

    setFilter(filter, el) {
        this.currentFilter = filter;

        // Update tab active state
        document.querySelectorAll('.market-tab').forEach(tab => tab.classList.remove('active'));
        if (el) el.classList.add('active');

        this.applyFilter();
    },

    applyFilter() {
        let tickers = [...this.tickers];

        // Apply search
        if (this.searchQuery) {
            tickers = tickers.filter(t =>
                t.symbol.toLowerCase().includes(this.searchQuery) ||
                (t.description && t.description.toLowerCase().includes(this.searchQuery))
            );
        }

        // Apply category filter
        switch (this.currentFilter) {
            case 'gainers':
                tickers = tickers.filter(t => t.change24h > 0).sort((a, b) => b.change24h - a.change24h);
                break;
            case 'losers':
                tickers = tickers.filter(t => t.change24h < 0).sort((a, b) => a.change24h - b.change24h);
                break;
            case 'volume':
                tickers.sort((a, b) => b.volume - a.volume);
                break;
            case 'value':
                tickers.sort((a, b) => b.turnover - a.turnover);
                break;
            case 'trending':
                // Top by absolute change * volume (shows most activity)
                tickers.sort((a, b) => (Math.abs(b.change24h) * b.volume) - (Math.abs(a.change24h) * a.volume));
                break;
            case '52high':
                tickers = tickers.filter(t => t.high > 0).sort((a, b) => {
                    const aRatio = a.price / a.high;
                    const bRatio = b.price / b.high;
                    return bRatio - aRatio;
                });
                break;
            case '52low':
                tickers = tickers.filter(t => t.low > 0).sort((a, b) => {
                    const aRatio = a.price / a.low;
                    const bRatio = b.price / b.low;
                    return aRatio - bRatio;
                });
                break;
            default:
                tickers.sort((a, b) => b.volume - a.volume);
        }

        this.filteredTickers = tickers;
        this.render();
    },

    render() {
        const container = document.getElementById('marketList');

        if (this.filteredTickers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📊</div>
                    <div class="title">${this.searchQuery ? 'No Results Found' : 'No Market Data'}</div>
                    <div class="desc">${this.searchQuery ? 'Try a different search term' : 'Connect your API to see live prices'}</div>
                </div>`;
            return;
        }

        container.innerHTML = this.filteredTickers.slice(0, 100).map(t => {
            const change = t.change24h || 0;
            const changeClass = change >= 0 ? 'positive' : 'negative';
            const changeSign = change >= 0 ? '+' : '';
            const symbolShort = t.symbol.replace('PERP', '').replace('USD', '').replace('INR', '').slice(0, 4);

            return `
                <div class="market-item" onclick="Market.showDetail('${t.symbol}')">
                    <div class="market-item-left">
                        <div class="market-item-icon">${symbolShort.slice(0, 2)}</div>
                        <div>
                            <div class="market-item-name">${t.symbol}</div>
                            <div class="market-item-sub">${t.contract_type || 'Perpetual'}</div>
                        </div>
                    </div>
                    <div class="market-item-right">
                        <div class="market-item-price">${this.formatPrice(t.price)}</div>
                        <div class="market-item-change ${changeClass}">${changeSign}${change.toFixed(2)}%</div>
                        <div class="market-item-volume">Vol: ${this.formatVolume(t.volume)}</div>
                    </div>
                </div>`;
        }).join('');
    },

    formatPrice(price) {
        if (!price) return '0';
        if (price >= 100) return price.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        if (price >= 1) return price.toFixed(4);
        return price.toFixed(8);
    },

    formatVolume(vol) {
        if (!vol) return '0';
        if (vol >= 1000000000) return (vol / 1000000000).toFixed(2) + 'B';
        if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
        if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
        return vol.toFixed(0);
    },

    showDetail(symbol) {
        // Future: show detailed chart/info
        App.showToast(`${symbol} selected`, 'info');
    }
};
