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
            headers: { 'User-Agent': 'CryptoBOT/1.0' }
        });
    }

    setCredentials(apiKey, apiSecret) {
        // Trim whitespace/invisible chars that may come from copy-paste
        this.apiKey = (apiKey || '').trim();
        this.apiSecret = (apiSecret || '').trim();
    }

    setTestnet(useTestnet) {
        this.baseUrl = useTestnet ? config.delta.testnetUrl : config.delta.baseUrl;
        this.client.defaults.baseURL = this.baseUrl;
    }

    generateSignature(method, path, queryString = '', body = '') {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        // Delta format: METHOD + timestamp + path + query_string + body
        const message = method + timestamp + path + queryString + body;
        const signature = crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');
        
        console.log(`[AUTH] method=${method} path=${path} qs=${queryString ? '(has qs)' : '(none)'} body=${body ? '(has body)' : '(none)'} ts=${timestamp}`);
        
        return { signature, timestamp };
    }

    getAuthHeaders(method, path, queryString = '', body = '') {
        if (!this.apiKey || !this.apiSecret) throw new Error('API credentials not set');
        const { signature, timestamp } = this.generateSignature(method, path, queryString, body);
        return {
            'api-key': this.apiKey,
            'signature': signature,
            'timestamp': timestamp,
            'User-Agent': 'CryptoBOT/1.0',
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
            
            // Delta Exchange can return errors in different formats:
            // { error: "string" } or { error: { code: "...", context: {...} } } or { message: "..." }
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

            console.error(`\n[DELTA API ERROR] Status: ${status}`);
            console.error(`[DELTA API ERROR] Full Response: ${JSON.stringify(data, null, 2)}`);

            // If Delta returns signature_data for debugging
            if (data?.error?.context?.signature_data) {
                console.error(`[DELTA API ERROR] Server signature_data: "${data.error.context.signature_data}"`);
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

    async getBalance(asset = 'INR') {
        const balances = await this.getWalletBalances();
        
        // Debug: log all available assets
        console.log(`[BALANCE] Looking for asset: ${asset}`);
        console.log(`[BALANCE] Available assets: ${balances.map(b => b.asset_symbol + '=' + b.balance).join(', ')}`);
        
        // Try to find matching asset with multiple name variants
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
            if (assetBalance) {
                console.log(`[BALANCE] Fallback: using ${assetBalance.asset_symbol} (${assetBalance.balance})`);
            }
        }
        
        if (assetBalance) {
            console.log(`[BALANCE] Found: ${assetBalance.asset_symbol} = ${assetBalance.balance} (available: ${assetBalance.available_balance})`);
        }
        
        return assetBalance ? {
            available: parseFloat(assetBalance.available_balance || assetBalance.balance || 0),
            balance: parseFloat(assetBalance.balance || 0),
            locked: parseFloat(assetBalance.position_margin || 0) + parseFloat(assetBalance.order_margin || 0),
            unrealizedPnl: parseFloat(assetBalance.unrealized_pnl || 0),
            assetSymbol: assetBalance.asset_symbol
        } : { available: 0, balance: 0, locked: 0, unrealizedPnl: 0, assetSymbol: asset };
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
            order_type: order.order_type || 'market_order',
            bracket_take_profit_price: order.take_profit_price?.toString(),
            bracket_stop_loss_price: order.stop_loss_price?.toString(),
            bracket_stop_trigger_method: order.trigger_method || 'mark_price'
        };
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

            console.log(`[TEST] Testing with API Key: ${this.apiKey.substring(0, 6)}...${this.apiKey.slice(-4)} (length: ${this.apiKey.length})`);
            console.log(`[TEST] API Secret length: ${this.apiSecret.length}`);
            console.log(`[TEST] Base URL: ${this.client.defaults.baseURL}`);

            const balances = await this.getWalletBalances();
            return { connected: true, balances };
        } catch (error) {
            return { connected: false, error: error.message };
        }
    }
}

module.exports = new DeltaExchangeAPI();
