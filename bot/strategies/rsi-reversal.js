/**
 * RSI Reversal Strategy (Optimized)
 * Buys when RSI < 30 (oversold), sells when RSI > 70 (overbought)
 * Enhanced with: divergence detection, confirmation candles, RSI slope
 */
class RSIReversalStrategy {
    constructor() {
        this.id = 'rsi-reversal';
        this.name = 'RSI Reversal';
        this.description = 'Buy oversold (RSI<30), Sell overbought (RSI>70). Enhanced with divergence detection.';
        this.winRate = 62;
        this.timeframe = '15m - 1h';
        this.riskLevel = 'Conservative';
        this.period = 14;
        this.oversold = 30;
        this.overbought = 70;
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
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

    // Calculate RSI for multiple points to detect divergence
    calculateRSISeries(closes, lookback = 5) {
        const series = [];
        for (let i = lookback; i >= 0; i--) {
            const slice = closes.slice(0, closes.length - i);
            const rsi = this.calculateRSI(slice);
            if (rsi !== null) series.push(rsi);
        }
        return series;
    }

    // Detect bullish/bearish divergence between price and RSI
    detectDivergence(closes, rsiSeries) {
        if (rsiSeries.length < 3 || closes.length < 3) return null;

        const priceLen = closes.length;
        const rsiLen = rsiSeries.length;

        // Bullish divergence: price makes lower low, RSI makes higher low
        const priceLow1 = closes[priceLen - 3];
        const priceLow2 = closes[priceLen - 1];
        const rsiLow1 = rsiSeries[rsiLen - 3];
        const rsiLow2 = rsiSeries[rsiLen - 1];

        if (priceLow2 < priceLow1 && rsiLow2 > rsiLow1) {
            return { type: 'bullish', reason: 'Bullish RSI divergence (price lower, RSI higher)' };
        }

        // Bearish divergence: price makes higher high, RSI makes lower high
        const priceHigh1 = closes[priceLen - 3];
        const priceHigh2 = closes[priceLen - 1];
        const rsiHigh1 = rsiSeries[rsiLen - 3];
        const rsiHigh2 = rsiSeries[rsiLen - 1];

        if (priceHigh2 > priceHigh1 && rsiHigh2 < rsiHigh1) {
            return { type: 'bearish', reason: 'Bearish RSI divergence (price higher, RSI lower)' };
        }

        return null;
    }

    analyze(marketData) {
        const { closes } = marketData;
        if (!closes || closes.length < this.period + 5) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const rsi = this.calculateRSI(closes);
        const prevCloses = closes.slice(0, -1);
        const prevRsi = this.calculateRSI(prevCloses);

        if (rsi === null || prevRsi === null) {
            return { signal: 'none', confidence: 0, reason: 'Cannot calculate RSI' };
        }

        // Calculate RSI slope (rate of change)
        const rsiSlope = rsi - prevRsi;

        // Detect divergence for confirmation
        const rsiSeries = this.calculateRSISeries(closes, 5);
        const divergence = this.detectDivergence(closes, rsiSeries);

        // Buy signal: RSI in oversold + confirmation
        if (rsi <= this.oversold) {
            // Require RSI to be turning up (confirmation candle)
            const hasConfirmation = rsiSlope > 0 || (divergence && divergence.type === 'bullish');

            if (!hasConfirmation) {
                return { signal: 'none', confidence: 20, reason: `RSI ${rsi.toFixed(1)} oversold but no confirmation (slope: ${rsiSlope.toFixed(1)})` };
            }

            let confidence = Math.min(95, 50 + (this.oversold - rsi) * 3);
            let reason = `RSI at ${rsi.toFixed(1)} (oversold) + turning up`;

            if (divergence && divergence.type === 'bullish') {
                confidence = Math.min(95, confidence + 10);
                reason += ' + ' + divergence.reason;
            }

            return {
                signal: 'buy', side: 'buy', confidence,
                reason,
                indicator: { rsi: rsi.toFixed(1), prevRsi: prevRsi.toFixed(1), slope: rsiSlope.toFixed(2), divergence: divergence?.type || 'none' }
            };
        }

        // Sell signal: RSI in overbought + confirmation
        if (rsi >= this.overbought) {
            const hasConfirmation = rsiSlope < 0 || (divergence && divergence.type === 'bearish');

            if (!hasConfirmation) {
                return { signal: 'none', confidence: 20, reason: `RSI ${rsi.toFixed(1)} overbought but no confirmation (slope: ${rsiSlope.toFixed(1)})` };
            }

            let confidence = Math.min(95, 50 + (rsi - this.overbought) * 3);
            let reason = `RSI at ${rsi.toFixed(1)} (overbought) + turning down`;

            if (divergence && divergence.type === 'bearish') {
                confidence = Math.min(95, confidence + 10);
                reason += ' + ' + divergence.reason;
            }

            return {
                signal: 'sell', side: 'sell', confidence,
                reason,
                indicator: { rsi: rsi.toFixed(1), prevRsi: prevRsi.toFixed(1), slope: rsiSlope.toFixed(2), divergence: divergence?.type || 'none' }
            };
        }

        return { signal: 'none', confidence: 0, reason: `RSI at ${rsi.toFixed(1)} - neutral zone` };
    }
}

module.exports = RSIReversalStrategy;
