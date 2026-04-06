/**
 * EMA Crossover Strategy
 * Buy when 9-EMA crosses above 21-EMA, Sell when below
 */
class EMACrossoverStrategy {
    constructor() {
        this.id = 'ema-crossover';
        this.name = 'EMA Crossover';
        this.description = '9-EMA crosses 21-EMA for trend following. Best for trending markets.';
        this.winRate = 58;
        this.timeframe = '1h - 4h';
        this.riskLevel = 'Moderate';
        this.shortPeriod = 9;
        this.longPeriod = 21;
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    calculateEMA(closes, period) {
        if (closes.length < period) return [];
        const multiplier = 2 / (period + 1);
        const ema = [closes.slice(0, period).reduce((a, b) => a + b, 0) / period];

        for (let i = period; i < closes.length; i++) {
            ema.push((closes[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
        }
        return ema;
    }

    analyze(marketData) {
        const { closes } = marketData;
        if (!closes || closes.length < this.longPeriod + 2) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const shortEma = this.calculateEMA(closes, this.shortPeriod);
        const longEma = this.calculateEMA(closes, this.longPeriod);

        if (shortEma.length < 2 || longEma.length < 2) {
            return { signal: 'none', confidence: 0, reason: 'Cannot calculate EMAs' };
        }

        // Align arrays
        const offset = shortEma.length - longEma.length;
        const currentShort = shortEma[shortEma.length - 1];
        const prevShort = shortEma[shortEma.length - 2];
        const currentLong = longEma[longEma.length - 1];
        const prevLong = longEma[longEma.length - 2];

        // Bullish crossover
        if (prevShort <= prevLong && currentShort > currentLong) {
            const gap = ((currentShort - currentLong) / currentLong) * 100;
            const confidence = Math.min(90, 55 + gap * 10);
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `EMA9 crossed above EMA21 (gap: ${gap.toFixed(3)}%)`,
                indicator: { ema9: currentShort.toFixed(2), ema21: currentLong.toFixed(2) }
            };
        }

        // Bearish crossover
        if (prevShort >= prevLong && currentShort < currentLong) {
            const gap = ((currentLong - currentShort) / currentLong) * 100;
            const confidence = Math.min(90, 55 + gap * 10);
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `EMA9 crossed below EMA21 (gap: ${gap.toFixed(3)}%)`,
                indicator: { ema9: currentShort.toFixed(2), ema21: currentLong.toFixed(2) }
            };
        }

        const position = currentShort > currentLong ? 'above' : 'below';
        return { signal: 'none', confidence: 0, reason: `EMA9 is ${position} EMA21 - no crossover` };
    }
}

module.exports = EMACrossoverStrategy;
