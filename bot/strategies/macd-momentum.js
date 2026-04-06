/**
 * MACD Momentum Strategy
 * Buy when MACD line crosses above signal line, Sell when below
 */
class MACDMomentumStrategy {
    constructor() {
        this.id = 'macd-momentum';
        this.name = 'MACD Momentum';
        this.description = 'MACD line vs Signal line crossovers for momentum detection.';
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

        // Align fast and slow EMAs
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
            prevMacd: macdLine[macdLine.length - 2],
            prevSignal: signalLine.length > 1 ? signalLine[signalLine.length - 2] : signalLine[0]
        };
    }

    analyze(marketData) {
        const { closes } = marketData;
        if (!closes || closes.length < this.slowPeriod + this.signalPeriod + 2) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const macd = this.calculateMACD(closes);
        if (!macd) return { signal: 'none', confidence: 0, reason: 'Cannot calculate MACD' };

        // Bullish crossover: MACD crosses above signal
        if (macd.prevMacd <= macd.prevSignal && macd.macd > macd.signal) {
            const strength = Math.abs(macd.histogram);
            const confidence = Math.min(90, 50 + strength * 20);
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `MACD crossed above signal (histogram: ${macd.histogram.toFixed(4)})`,
                indicator: { macd: macd.macd.toFixed(4), signal: macd.signal.toFixed(4), histogram: macd.histogram.toFixed(4) }
            };
        }

        // Bearish crossover: MACD crosses below signal
        if (macd.prevMacd >= macd.prevSignal && macd.macd < macd.signal) {
            const strength = Math.abs(macd.histogram);
            const confidence = Math.min(90, 50 + strength * 20);
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `MACD crossed below signal (histogram: ${macd.histogram.toFixed(4)})`,
                indicator: { macd: macd.macd.toFixed(4), signal: macd.signal.toFixed(4), histogram: macd.histogram.toFixed(4) }
            };
        }

        return { signal: 'none', confidence: 0, reason: `MACD: ${macd.macd.toFixed(4)}, Signal: ${macd.signal.toFixed(4)} - no crossover` };
    }
}

module.exports = MACDMomentumStrategy;
