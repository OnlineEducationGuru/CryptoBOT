const axios = require('axios');
const crypto = require('crypto');
const config = require('../config.json');

class DeltaExchangeAPI {
    constructor() {
        this.apiKey = null;
        this.apiSecret = null;
        this.baseUrl = config.delta.baseUrl;
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,
            headers: { 'User-Agent': 'CryptoBOT/2.0' }
        });

        // Live exchange rate cache
        this._exchangeRates = { USD_INR: 94 };
        this._rateLastFetch = 0;
    }

    setCredentials(apiKey, apiSecret) {
        this.apiKey = (apiKey || '').trim();
        this.apiSecret = (apiSecret || '').trim();
    }

    setTestnet(useTestnet) {
        this.baseUrl = useTestnet ? config.delta.testnetUrl : config.delta.baseUrl;
        this.client.defaults.baseURL = this.baseUrl;
    }

    generateSignature(method, path, queryString = '', body = '') {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const message = method + timestamp + path + queryString + body;
        const signature = crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');
        return { signature, timestamp };
    }

    getAuthHeaders(method, path, queryString = '', body = '') {
        if (!this.apiKey || !this.apiSecret) throw new Error('API credentials not set');
        const { signature, timestamp } = this.generateSignature(method, path, queryString, body);
        return {
            'api-key': this.apiKey,
            'signature': signature,
            'timestamp': timestamp,
            'User-Agent': 'CryptoBOT/2.0',
            'Content-Type': 'application/json'
        };
    }

    async publicGet(path, params = {}) {
        try {
            const response = await this.client.get(path, { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async privateGet(path, params = {}) {
        try {
            let queryString = '';
            if (Object.keys(params).length > 0) {
                queryString = '?' + new URLSearchParams(params).toString();
            }
            const headers = this.getAuthHeaders('GET', path, queryString, '');
            const response = await this.client.get(path + queryString, { headers });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async privatePost(path, data = {}) {
        try {
            const body = JSON.stringify(data);
            const headers = this.getAuthHeaders('POST', path, '', body);
            const response = await this.client.post(path, data, { headers });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async privatePut(path, data = {}) {
        try {
            const body = JSON.stringify(data);
            const headers = this.getAuthHeaders('PUT', path, '', body);
            const response = await this.client.put(path, data, { headers });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async privateDelete(path, data = {}) {
        try {
            const body = Object.keys(data).length > 0 ? JSON.stringify(data) : '';
            const headers = this.getAuthHeaders('DELETE', path, '', body);
            const response = await this.client.delete(path, { headers, data });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    handleError(error) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            let msg = 'Unknown API error';
            if (data) {
                if (typeof data === 'string') {
                    msg = data;
                } else if (typeof data.message === 'string') {
                    msg = data.message;
                } else if (typeof data.error === 'string') {
                    msg = data.error;
                } else if (data.error && typeof data.error === 'object') {
                    msg = data.error.code || data.error.message || JSON.stringify(data.error);
                    if (data.error.context) {
                        msg += ' | Context: ' + JSON.stringify(data.error.context);
                    }
                } else {
                    msg = JSON.stringify(data);
                }
            }

            if (status === 429) return new Error('Rate limited. Please wait before retrying.');
            if (status === 401) return new Error(`Authentication failed (401): ${msg}`);
            if (status === 403) return new Error(`Permission denied (403): ${msg}`);
            return new Error(`Delta API Error (${status}): ${msg}`);
        }
        if (error.code === 'ECONNABORTED') return new Error('Request timeout. Delta Exchange may be down.');
        if (error.code === 'ECONNREFUSED') return new Error('Connection refused. Delta Exchange API may be down.');
        return new Error(`Network error: ${error.message}`);
    }

    // === Exchange Rate ===

    /**
     * Fetch live USD/INR rate from Delta Exchange tickers
     * Falls back to external APIs if Delta doesn't have it
     */
    async fetchExchangeRate() {
        // Cache for 5 minutes
        if (Date.now() - this._rateLastFetch < 300000 && this._exchangeRates.USD_INR) {
            return this._exchangeRates;
        }

        try {
            // Try Delta's USDINR ticker first
            const tickers = await this.publicGet('/v2/tickers');
            const results = tickers.result || tickers || [];

            // Look for USDINR or similar pair
            const inrTicker = results.find(t =>
                t.symbol && (
                    t.symbol.includes('USDINR') ||
                    t.symbol.includes('USD_INR')
                )
            );

            if (inrTicker && parseFloat(inrTicker.mark_price || inrTicker.close) > 0) {
                const rate = parseFloat(inrTicker.mark_price || inrTicker.close);
                this._exchangeRates.USD_INR = rate;
                this._rateLastFetch = Date.now();
                console.log(`[RATE] USD/INR from Delta: ₹${rate}`);
                return this._exchangeRates;
            }
        } catch (e) { /* fallthrough */ }

        // Fallback: try external API
        try {
            const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 5000 });
            if (res.data && res.data.rates && res.data.rates.INR) {
                this._exchangeRates.USD_INR = res.data.rates.INR;
                this._rateLastFetch = Date.now();
                console.log(`[RATE] USD/INR from external API: ₹${this._exchangeRates.USD_INR}`);
                return this._exchangeRates;
            }
        } catch (e) { /* fallthrough */ }

        // Final fallback
        console.log(`[RATE] Using cached USD/INR: ₹${this._exchangeRates.USD_INR}`);
        return this._exchangeRates;
    }

    getExchangeRates() {
        return this._exchangeRates;
    }

    // === Public Endpoints ===

    async getProducts() {
        const data = await this.publicGet('/v2/products');
        return data.result || [];
    }

    async getTickers() {
        const data = await this.publicGet('/v2/tickers');
        return data.result || [];
    }

    async getTickerBySymbol(symbol) {
        const data = await this.publicGet(`/v2/tickers/${symbol}`);
        return data.result || null;
    }

    async getOrderbook(productId, depth = 20) {
        const data = await this.publicGet(`/v2/l2orderbook/${productId}`);
        return data.result || null;
    }

    async getCandles(symbol, resolution = '1m', start, end) {
        const params = { symbol, resolution };
        if (start) params.start = start;
        if (end) params.end = end;
        const data = await this.publicGet('/v2/history/candles', params);
        return data.result || [];
    }

    // === Private Endpoints ===

    async getWalletBalances() {
        const data = await this.privateGet('/v2/wallet/balances');
        return data.result || [];
    }

    /**
     * Get balance — returns the ACTUAL wallet balance visible in Delta app
     * Debug: logs raw API response to help verify correct field mapping
     */
    async getBalance(asset = 'INR') {
        const balances = await this.getWalletBalances();

        const searchTerms = [asset];
        if (asset === 'USD') searchTerms.push('USDT', 'USDC');
        if (asset === 'USDT') searchTerms.push('USD', 'USDC');
        if (asset === 'INR') searchTerms.push('DINR');

        let assetBalance = null;
        for (const term of searchTerms) {
            assetBalance = balances.find(b =>
                (b.asset_symbol || '').toUpperCase() === term.toUpperCase() ||
                (b.asset_id || '').toString() === term
            );
            if (assetBalance && parseFloat(assetBalance.balance || 0) > 0) break;
        }

        // If still not found, use the first balance with money in it
        if (!assetBalance || parseFloat(assetBalance.balance || 0) === 0) {
            assetBalance = balances.find(b => parseFloat(b.balance || 0) > 0);
        }

        if (assetBalance) {
            // === RAW DELTA API FIELDS ===
            // balance              = Total equity (cash + unrealized PnL + margin)
            // available_balance    = Free cash you can withdraw/trade with
            // position_margin      = Margin locked in open positions
            // order_margin         = Margin reserved for open orders
            // commission           = Fees
            // unrealized_pnl       = P&L from open positions (not realized yet)
            //
            // WHAT USER SEES IN DELTA APP as "Wallet Balance" = available_balance
            // (the free funds NOT locked in any position or order)

            const rawBalance = parseFloat(assetBalance.balance || 0);
            const rawAvailable = parseFloat(assetBalance.available_balance || 0);
            const positionMargin = parseFloat(assetBalance.position_margin || 0);
            const orderMargin = parseFloat(assetBalance.order_margin || 0);
            const unrealizedPnl = parseFloat(assetBalance.unrealized_pnl || 0);
            const commission = parseFloat(assetBalance.commission || 0);

            // Debug log — helps verify which field matches Delta app
            console.log(`[BALANCE DEBUG] Asset: ${assetBalance.asset_symbol}`);
            console.log(`  Raw balance (equity):     ${rawBalance}`);
            console.log(`  Raw available_balance:    ${rawAvailable}`);
            console.log(`  position_margin:          ${positionMargin}`);
            console.log(`  order_margin:             ${orderMargin}`);
            console.log(`  unrealized_pnl:           ${unrealizedPnl}`);
            console.log(`  commission:               ${commission}`);

            // The actual wallet balance (what user sees in Delta app) = available_balance
            // This is the free cash NOT locked in positions or orders
            const walletBalance = rawAvailable;

            // Equity = total portfolio value (includes locked margin + unrealized PnL)
            const equity = rawBalance;

            return {
                available: walletBalance,            // Free cash for trading
                balance: walletBalance,              // Display value (matches Delta app)
                equity: equity,                      // Total equity (for reference)
                walletBalance: walletBalance,         // Explicit: Delta app wallet balance
                depositBalance: rawBalance - positionMargin - orderMargin - unrealizedPnl, // Pure deposited funds
                positionMargin: positionMargin,
                orderMargin: orderMargin,
                marginUsed: positionMargin + orderMargin,
                locked: positionMargin + orderMargin,
                unrealizedPnl: unrealizedPnl,
                assetSymbol: assetBalance.asset_symbol,
                // Include raw fields for frontend debugging
                _raw: {
                    balance: rawBalance,
                    available_balance: rawAvailable,
                    position_margin: positionMargin,
                    order_margin: orderMargin,
                    unrealized_pnl: unrealizedPnl
                }
            };
        }

        return { available: 0, balance: 0, walletBalance: 0, equity: 0, depositBalance: 0, totalBalance: 0, marginUsed: 0, locked: 0, unrealizedPnl: 0, assetSymbol: asset };
    }

    async getPositions() {
        const data = await this.privateGet('/v2/positions');
        return (data.result || []).filter(p => parseFloat(p.size) !== 0);
    }

    async getOpenOrders(productId = null) {
        const params = {};
        if (productId) params.product_id = productId;
        const data = await this.privateGet('/v2/orders', params);
        return data.result || [];
    }

    async placeOrder(order) {
        const payload = {
            product_id: order.product_id,
            size: order.size,
            side: order.side,
            order_type: order.order_type || 'market_order'
        };
        if (order.limit_price) payload.limit_price = order.limit_price.toString();
        if (order.stop_price) payload.stop_price = order.stop_price.toString();
        if (order.reduce_only) payload.reduce_only = true;
        if (order.time_in_force) payload.time_in_force = order.time_in_force;
        if (order.post_only) payload.post_only = true;

        const data = await this.privatePost('/v2/orders', payload);
        return data.result || data;
    }

    async placeBracketOrder(order) {
        const payload = {
            product_id: order.product_id,
            size: order.size,
            side: order.side,
            order_type: order.order_type || 'market_order'
        };
        // Only include bracket fields when they have values
        if (order.take_profit_price) {
            payload.bracket_take_profit_price = order.take_profit_price.toString();
        }
        if (order.stop_loss_price) {
            payload.bracket_stop_loss_price = order.stop_loss_price.toString();
            payload.bracket_stop_trigger_method = order.trigger_method || 'mark_price';
        }
        if (order.limit_price) payload.limit_price = order.limit_price.toString();

        const data = await this.privatePost('/v2/orders', payload);
        return data.result || data;
    }

    async cancelOrder(orderId, productId) {
        const data = await this.privateDelete('/v2/orders', {
            id: orderId,
            product_id: productId
        });
        return data.result || data;
    }

    async cancelAllOrders(productId = null) {
        const payload = {};
        if (productId) payload.product_id = productId;
        const data = await this.privateDelete('/v2/orders/all', payload);
        return data.result || data;
    }

    async setLeverage(productId, leverage) {
        const data = await this.privatePost('/v2/orders/leverage', {
            product_id: productId,
            leverage: leverage.toString()
        });
        return data.result || data;
    }

    async getOrderHistory(params = {}) {
        const data = await this.privateGet('/v2/orders/history', params);
        return data.result || [];
    }

    async getFills(params = {}) {
        const data = await this.privateGet('/v2/fills', params);
        return data.result || [];
    }

    // === Connection Test ===
    async testConnection() {
        try {
            if (!this.apiKey || !this.apiSecret) {
                return { connected: false, error: 'API credentials not set' };
            }

            const balances = await this.getWalletBalances();
            return { connected: true, balances };
        } catch (error) {
            return { connected: false, error: error.message };
        }
    }
}

module.exports = new DeltaExchangeAPI();
