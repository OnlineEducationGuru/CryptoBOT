/**
 * VWAP Strategy
 * Buy below VWAP, Sell above VWAP. Best for intraday trading.
 */
class VWAPStrategy {
    constructor() {
        this.id = 'vwap-strategy';
        this.name = 'VWAP Strategy';
        this.description = 'Buy below VWAP (undervalued), Sell above VWAP (overvalued). Best intraday.';
        this.winRate = 64;
        this.timeframe = '5m - 1h';
        this.riskLevel = 'Conservative';
        this.threshold = 0.3; // % deviation from VWAP to trigger
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    calculateVWAP(closes, volumes) {
        if (!closes || !volumes || closes.length < 5 || volumes.length < 5) return null;

        const len = Math.min(closes.length, volumes.length);
        let cumulativeTP_Vol = 0;
        let cumulativeVol = 0;

        for (let i = 0; i < len; i++) {
            cumulativeTP_Vol += closes[i] * volumes[i];
            cumulativeVol += volumes[i];
        }

        if (cumulativeVol === 0) return null;
        return cumulativeTP_Vol / cumulativeVol;
    }

    analyze(marketData) {
        const { closes, volumes } = marketData;
        if (!closes || !volumes || closes.length < 10) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const vwap = this.calculateVWAP(closes, volumes);
        if (!vwap) return { signal: 'none', confidence: 0, reason: 'Cannot calculate VWAP' };

        const currentPrice = closes[closes.length - 1];
        const deviation = ((currentPrice - vwap) / vwap) * 100;
        const prevPrice = closes[closes.length - 2];
        const prevDeviation = ((prevPrice - vwap) / vwap) * 100;

        // Buy: Price is below VWAP and starting to recover
        if (deviation < -this.threshold && currentPrice > prevPrice) {
            const confidence = Math.min(90, 55 + Math.abs(deviation) * 8);
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `Price ${Math.abs(deviation).toFixed(2)}% below VWAP & recovering`,
                indicator: { vwap: vwap.toFixed(2), deviation: deviation.toFixed(2) + '%', price: currentPrice.toFixed(2) }
            };
        }

        // Sell: Price is above VWAP and starting to fall
        if (deviation > this.threshold && currentPrice < prevPrice) {
            const confidence = Math.min(90, 55 + Math.abs(deviation) * 8);
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `Price ${deviation.toFixed(2)}% above VWAP & declining`,
                indicator: { vwap: vwap.toFixed(2), deviation: deviation.toFixed(2) + '%', price: currentPrice.toFixed(2) }
            };
        }

        return { signal: 'none', confidence: 0, reason: `Price ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}% from VWAP - no clear signal` };
    }
}

module.exports = VWAPStrategy;
