/**
 * Bollinger Band Breakout Strategy
 * Buy at lower band, Sell at upper band
 */
class BollingerBreakoutStrategy {
    constructor() {
        this.id = 'bollinger-breakout';
        this.name = 'Bollinger Breakout';
        this.description = 'Buy at lower Bollinger Band, Sell at upper band. Best for volatility trading.';
        this.winRate = 60;
        this.timeframe = '15m - 1h';
        this.riskLevel = 'Aggressive';
        this.period = 20;
        this.stdDevMultiplier = 2;
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    calculateBollingerBands(closes) {
        if (closes.length < this.period) return null;

        const slice = closes.slice(-this.period);
        const sma = slice.reduce((a, b) => a + b, 0) / this.period;
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / this.period;
        const stdDev = Math.sqrt(variance);

        return {
            upper: sma + (this.stdDevMultiplier * stdDev),
            middle: sma,
            lower: sma - (this.stdDevMultiplier * stdDev),
            bandwidth: ((sma + this.stdDevMultiplier * stdDev) - (sma - this.stdDevMultiplier * stdDev)) / sma * 100
        };
    }

    analyze(marketData) {
        const { closes } = marketData;
        if (!closes || closes.length < this.period + 2) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const bands = this.calculateBollingerBands(closes);
        const prevBands = this.calculateBollingerBands(closes.slice(0, -1));

        if (!bands || !prevBands) {
            return { signal: 'none', confidence: 0, reason: 'Cannot calculate Bollinger Bands' };
        }

        const currentPrice = closes[closes.length - 1];
        const prevPrice = closes[closes.length - 2];

        // Calculate %B (position within bands)
        const percentB = (currentPrice - bands.lower) / (bands.upper - bands.lower);

        // Buy: Price touches or goes below lower band
        if (currentPrice <= bands.lower || (prevPrice < prevBands.lower && currentPrice > bands.lower)) {
            const distance = ((bands.lower - currentPrice) / bands.lower) * 100;
            const confidence = Math.min(90, 55 + Math.max(0, distance) * 15);
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `Price at lower Bollinger Band (%B: ${(percentB * 100).toFixed(1)}%)`,
                indicator: { upper: bands.upper.toFixed(2), middle: bands.middle.toFixed(2), lower: bands.lower.toFixed(2), percentB: (percentB * 100).toFixed(1) }
            };
        }

        // Sell: Price touches or goes above upper band
        if (currentPrice >= bands.upper || (prevPrice > prevBands.upper && currentPrice < bands.upper)) {
            const distance = ((currentPrice - bands.upper) / bands.upper) * 100;
            const confidence = Math.min(90, 55 + Math.max(0, distance) * 15);
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `Price at upper Bollinger Band (%B: ${(percentB * 100).toFixed(1)}%)`,
                indicator: { upper: bands.upper.toFixed(2), middle: bands.middle.toFixed(2), lower: bands.lower.toFixed(2), percentB: (percentB * 100).toFixed(1) }
            };
        }

        return { signal: 'none', confidence: 0, reason: `Price within bands (%B: ${(percentB * 100).toFixed(1)}%)` };
    }
}

module.exports = BollingerBreakoutStrategy;
