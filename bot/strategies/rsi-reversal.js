/**
 * RSI Reversal Strategy
 * Buys when RSI < 30 (oversold), sells when RSI > 70 (overbought)
 */
class RSIReversalStrategy {
    constructor() {
        this.id = 'rsi-reversal';
        this.name = 'RSI Reversal';
        this.description = 'Buy oversold (RSI<30), Sell overbought (RSI>70). Best for range-bound markets.';
        this.winRate = 62;
        this.timeframe = '15m - 1h';
        this.riskLevel = 'Conservative';
        this.period = 14;
        this.oversold = 30;
        this.overbought = 70;
    }

    getInfo() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            winRate: this.winRate,
            timeframe: this.timeframe,
            riskLevel: this.riskLevel
        };
    }

    calculateRSI(closes) {
        if (closes.length < this.period + 1) return null;

        let gains = 0, losses = 0;
        for (let i = 1; i <= this.period; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }

        let avgGain = gains / this.period;
        let avgLoss = losses / this.period;

        for (let i = this.period + 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            avgGain = (avgGain * (this.period - 1) + (diff > 0 ? diff : 0)) / this.period;
            avgLoss = (avgLoss * (this.period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / this.period;
        }

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    analyze(marketData) {
        const { closes } = marketData;
        if (!closes || closes.length < this.period + 2) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const rsi = this.calculateRSI(closes);
        const prevCloses = closes.slice(0, -1);
        const prevRsi = this.calculateRSI(prevCloses);

        if (rsi === null || prevRsi === null) {
            return { signal: 'none', confidence: 0, reason: 'Cannot calculate RSI' };
        }

        // Buy signal: RSI crosses above oversold level
        if (rsi <= this.oversold) {
            const confidence = Math.min(95, 50 + (this.oversold - rsi) * 3);
            return {
                signal: 'buy',
                side: 'buy',
                confidence,
                reason: `RSI at ${rsi.toFixed(1)} (oversold < ${this.oversold})`,
                indicator: { rsi: rsi.toFixed(1), prevRsi: prevRsi.toFixed(1) }
            };
        }

        // Sell signal: RSI crosses below overbought level
        if (rsi >= this.overbought) {
            const confidence = Math.min(95, 50 + (rsi - this.overbought) * 3);
            return {
                signal: 'sell',
                side: 'sell',
                confidence,
                reason: `RSI at ${rsi.toFixed(1)} (overbought > ${this.overbought})`,
                indicator: { rsi: rsi.toFixed(1), prevRsi: prevRsi.toFixed(1) }
            };
        }

        return { signal: 'none', confidence: 0, reason: `RSI at ${rsi.toFixed(1)} - neutral zone` };
    }
}

module.exports = RSIReversalStrategy;
