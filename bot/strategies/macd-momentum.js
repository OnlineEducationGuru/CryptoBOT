/**
 * MACD Momentum Strategy (Optimized)
 * Enhanced with divergence detection, zero-line confirmation, and histogram growth check
 */
class MACDMomentumStrategy {
    constructor() {
        this.id = 'macd-momentum';
        this.name = 'MACD Momentum';
        this.description = 'MACD with divergence detection + histogram growth filter.';
        this.winRate = 55;
        this.timeframe = '30m - 4h';
        this.riskLevel = 'Moderate';
        this.fastPeriod = 12;
        this.slowPeriod = 26;
        this.signalPeriod = 9;
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    calculateEMA(data, period) {
        if (data.length < period) return [];
        const multiplier = 2 / (period + 1);
        const ema = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
        for (let i = period; i < data.length; i++) {
            ema.push((data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
        }
        return ema;
    }

    calculateMACD(closes) {
        const fastEma = this.calculateEMA(closes, this.fastPeriod);
        const slowEma = this.calculateEMA(closes, this.slowPeriod);

        if (fastEma.length === 0 || slowEma.length === 0) return null;

        const offset = fastEma.length - slowEma.length;
        const macdLine = [];
        for (let i = 0; i < slowEma.length; i++) {
            macdLine.push(fastEma[i + offset] - slowEma[i]);
        }

        const signalLine = this.calculateEMA(macdLine, this.signalPeriod);
        if (signalLine.length === 0) return null;

        const sigOffset = macdLine.length - signalLine.length;
        const histogram = [];
        for (let i = 0; i < signalLine.length; i++) {
            histogram.push(macdLine[i + sigOffset] - signalLine[i]);
        }

        return {
            macd: macdLine[macdLine.length - 1],
            signal: signalLine[signalLine.length - 1],
            histogram: histogram[histogram.length - 1],
            prevHistogram: histogram.length > 1 ? histogram[histogram.length - 2] : 0,
            prevMacd: macdLine[macdLine.length - 2],
            prevSignal: signalLine.length > 1 ? signalLine[signalLine.length - 2] : signalLine[0],
            // For divergence
            macdSeries: macdLine.slice(-5),
            histogramSeries: histogram.slice(-5)
        };
    }

    // Detect MACD divergence
    detectDivergence(closes, macdData) {
        if (!macdData || macdData.macdSeries.length < 3 || closes.length < 3) return null;

        const priceLen = closes.length;
        const macdLen = macdData.macdSeries.length;

        // Bullish divergence: price lower low, MACD higher low
        if (closes[priceLen - 1] < closes[priceLen - 3] && macdData.macdSeries[macdLen - 1] > macdData.macdSeries[macdLen - 3]) {
            return { type: 'bullish', reason: 'Bullish MACD divergence' };
        }

        // Bearish divergence: price higher high, MACD lower high
        if (closes[priceLen - 1] > closes[priceLen - 3] && macdData.macdSeries[macdLen - 1] < macdData.macdSeries[macdLen - 3]) {
            return { type: 'bearish', reason: 'Bearish MACD divergence' };
        }

        return null;
    }

    analyze(marketData) {
        const { closes } = marketData;
        if (!closes || closes.length < this.slowPeriod + this.signalPeriod + 2) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const macd = this.calculateMACD(closes);
        if (!macd) return { signal: 'none', confidence: 0, reason: 'Cannot calculate MACD' };

        const divergence = this.detectDivergence(closes, macd);

        // Check histogram is growing (not just crossed but momentum is increasing)
        const histogramGrowing = Math.abs(macd.histogram) > Math.abs(macd.prevHistogram);

        // Bullish crossover: MACD crosses above signal
        if (macd.prevMacd <= macd.prevSignal && macd.macd > macd.signal) {
            // Require histogram to be growing
            if (!histogramGrowing && !divergence) {
                return { signal: 'none', confidence: 20, reason: `MACD crossed up but histogram shrinking — weak momentum` };
            }

            const strength = Math.abs(macd.histogram);
            let confidence = Math.min(90, 50 + strength * 20);
            let reason = `MACD crossed above signal (hist: ${macd.histogram.toFixed(4)})`;

            // Zero-line confirmation bonus
            if (macd.macd > 0) {
                confidence = Math.min(92, confidence + 5);
                reason += ' + above zero-line';
            }

            if (divergence && divergence.type === 'bullish') {
                confidence = Math.min(95, confidence + 8);
                reason += ' + ' + divergence.reason;
            }

            return {
                signal: 'buy', side: 'buy', confidence,
                reason,
                indicator: { macd: macd.macd.toFixed(4), signal: macd.signal.toFixed(4), histogram: macd.histogram.toFixed(4), divergence: divergence?.type || 'none' }
            };
        }

        // Bearish crossover
        if (macd.prevMacd >= macd.prevSignal && macd.macd < macd.signal) {
            if (!histogramGrowing && !divergence) {
                return { signal: 'none', confidence: 20, reason: `MACD crossed down but histogram shrinking — weak momentum` };
            }

            const strength = Math.abs(macd.histogram);
            let confidence = Math.min(90, 50 + strength * 20);
            let reason = `MACD crossed below signal (hist: ${macd.histogram.toFixed(4)})`;

            if (macd.macd < 0) {
                confidence = Math.min(92, confidence + 5);
                reason += ' + below zero-line';
            }

            if (divergence && divergence.type === 'bearish') {
                confidence = Math.min(95, confidence + 8);
                reason += ' + ' + divergence.reason;
            }

            return {
                signal: 'sell', side: 'sell', confidence,
                reason,
                indicator: { macd: macd.macd.toFixed(4), signal: macd.signal.toFixed(4), histogram: macd.histogram.toFixed(4), divergence: divergence?.type || 'none' }
            };
        }

        return { signal: 'none', confidence: 0, reason: `MACD: ${macd.macd.toFixed(4)}, Signal: ${macd.signal.toFixed(4)} - no crossover` };
    }
}

module.exports = MACDMomentumStrategy;
