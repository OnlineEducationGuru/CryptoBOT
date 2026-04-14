/**
 * Stochastic RSI Strategy
 * Combines Stochastic oscillator with RSI for better overbought/oversold signals
 */
class StochasticRSIStrategy {
    constructor() {
        this.id = 'stochastic-rsi';
        this.name = 'Stochastic RSI';
        this.description = 'Stochastic + RSI combo. Better overbought/oversold than plain RSI.';
        this.winRate = 64;
        this.timeframe = '15m - 1h';
        this.riskLevel = 'Moderate';
        this.rsiPeriod = 14;
        this.stochPeriod = 14;
        this.kSmooth = 3;
        this.dSmooth = 3;
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    calculateRSISeries(closes) {
        if (closes.length < this.rsiPeriod + 1) return [];
        const rsiValues = [];

        let gains = 0, losses = 0;
        for (let i = 1; i <= this.rsiPeriod; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }

        let avgGain = gains / this.rsiPeriod;
        let avgLoss = losses / this.rsiPeriod;
        rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));

        for (let i = this.rsiPeriod + 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            avgGain = (avgGain * (this.rsiPeriod - 1) + (diff > 0 ? diff : 0)) / this.rsiPeriod;
            avgLoss = (avgLoss * (this.rsiPeriod - 1) + (diff < 0 ? Math.abs(diff) : 0)) / this.rsiPeriod;
            rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
        }

        return rsiValues;
    }

    calculateStochRSI(closes) {
        const rsiValues = this.calculateRSISeries(closes);
        if (rsiValues.length < this.stochPeriod) return null;

        // Stochastic of RSI
        const kValues = [];
        for (let i = this.stochPeriod - 1; i < rsiValues.length; i++) {
            const window = rsiValues.slice(i - this.stochPeriod + 1, i + 1);
            const high = Math.max(...window);
            const low = Math.min(...window);
            const k = high === low ? 50 : ((rsiValues[i] - low) / (high - low)) * 100;
            kValues.push(k);
        }

        if (kValues.length < this.kSmooth) return null;

        // Smooth %K
        const smoothK = [];
        for (let i = this.kSmooth - 1; i < kValues.length; i++) {
            const avg = kValues.slice(i - this.kSmooth + 1, i + 1).reduce((a, b) => a + b, 0) / this.kSmooth;
            smoothK.push(avg);
        }

        if (smoothK.length < this.dSmooth) return null;

        // %D = SMA of smooth %K
        const dValues = [];
        for (let i = this.dSmooth - 1; i < smoothK.length; i++) {
            const avg = smoothK.slice(i - this.dSmooth + 1, i + 1).reduce((a, b) => a + b, 0) / this.dSmooth;
            dValues.push(avg);
        }

        return {
            k: smoothK[smoothK.length - 1],
            d: dValues[dValues.length - 1],
            prevK: smoothK.length > 1 ? smoothK[smoothK.length - 2] : smoothK[0],
            prevD: dValues.length > 1 ? dValues[dValues.length - 2] : dValues[0],
            rsi: rsiValues[rsiValues.length - 1]
        };
    }

    analyze(marketData) {
        const { closes } = marketData;
        if (!closes || closes.length < this.rsiPeriod + this.stochPeriod + 5) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for Stochastic RSI' };
        }

        const stochRSI = this.calculateStochRSI(closes);
        if (!stochRSI) return { signal: 'none', confidence: 0, reason: 'Cannot calculate Stochastic RSI' };

        const { k, d, prevK, prevD, rsi } = stochRSI;

        // Buy: %K crosses above %D in oversold zone (< 20)
        if (k < 20 && prevK <= prevD && k > d) {
            const confidence = Math.min(88, 60 + (20 - k) * 1.5);
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `StochRSI %K crossed above %D in oversold zone (K:${k.toFixed(1)}, D:${d.toFixed(1)}, RSI:${rsi.toFixed(1)})`,
                indicator: { k: k.toFixed(1), d: d.toFixed(1), rsi: rsi.toFixed(1), zone: 'oversold' }
            };
        }

        // Sell: %K crosses below %D in overbought zone (> 80)
        if (k > 80 && prevK >= prevD && k < d) {
            const confidence = Math.min(88, 60 + (k - 80) * 1.5);
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `StochRSI %K crossed below %D in overbought zone (K:${k.toFixed(1)}, D:${d.toFixed(1)}, RSI:${rsi.toFixed(1)})`,
                indicator: { k: k.toFixed(1), d: d.toFixed(1), rsi: rsi.toFixed(1), zone: 'overbought' }
            };
        }

        return { signal: 'none', confidence: 0, reason: `StochRSI K:${k.toFixed(1)} D:${d.toFixed(1)} — neutral zone` };
    }
}

module.exports = StochasticRSIStrategy;
