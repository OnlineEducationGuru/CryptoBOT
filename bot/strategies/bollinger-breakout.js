/**
 * Bollinger Band Breakout Strategy (Optimized)
 * Enhanced with squeeze detection, %B slope analysis, and volume confirmation
 */
class BollingerBreakoutStrategy {
    constructor() {
        this.id = 'bollinger-breakout';
        this.name = 'Bollinger Breakout';
        this.description = 'Bollinger Bands with squeeze detection + volume confirmation.';
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
            bandwidth: ((sma + this.stdDevMultiplier * stdDev) - (sma - this.stdDevMultiplier * stdDev)) / sma * 100,
            stdDev
        };
    }

    // Detect Bollinger squeeze (bands getting tight = breakout imminent)
    detectSqueeze(closes) {
        if (closes.length < this.period + 10) return { isSqueeze: false };

        const currentBands = this.calculateBollingerBands(closes);
        const pastBands = this.calculateBollingerBands(closes.slice(0, -5));

        if (!currentBands || !pastBands) return { isSqueeze: false };

        // Squeeze = current bandwidth is significantly lower than recent
        const bwRatio = currentBands.bandwidth / pastBands.bandwidth;
        return {
            isSqueeze: bwRatio < 0.7,
            ratio: bwRatio,
            currentBW: currentBands.bandwidth,
            pastBW: pastBands.bandwidth
        };
    }

    analyze(marketData) {
        const { closes, volumes } = marketData;
        if (!closes || closes.length < this.period + 5) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const bands = this.calculateBollingerBands(closes);
        const prevBands = this.calculateBollingerBands(closes.slice(0, -1));

        if (!bands || !prevBands) {
            return { signal: 'none', confidence: 0, reason: 'Cannot calculate Bollinger Bands' };
        }

        const currentPrice = closes[closes.length - 1];
        const prevPrice = closes[closes.length - 2];
        const percentB = (currentPrice - bands.lower) / (bands.upper - bands.lower);
        const prevPercentB = (prevPrice - prevBands.lower) / (prevBands.upper - prevBands.lower);
        const percentBSlope = percentB - prevPercentB;

        // Check volume confirmation
        let volumeConfirmed = true;
        if (volumes && volumes.length >= 10) {
            const recentVol = volumes[volumes.length - 1];
            const avgVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
            volumeConfirmed = recentVol > avgVol * 0.8; // At least 80% of average
        }

        // Check squeeze
        const squeeze = this.detectSqueeze(closes);

        // Buy: Price touches or goes below lower band WITH confirmation
        if (currentPrice <= bands.lower || (prevPrice < prevBands.lower && currentPrice > bands.lower)) {
            // Require %B turning up (not still falling)
            if (percentBSlope < -0.05 && currentPrice <= bands.lower) {
                return { signal: 'none', confidence: 15, reason: `At lower band but %B still falling (slope: ${percentBSlope.toFixed(3)})` };
            }

            if (!volumeConfirmed) {
                return { signal: 'none', confidence: 15, reason: 'At lower band but low volume — weak signal' };
            }

            const distance = ((bands.lower - currentPrice) / bands.lower) * 100;
            let confidence = Math.min(90, 55 + Math.max(0, distance) * 15);
            let reason = `Price at lower BB (%B: ${(percentB * 100).toFixed(1)}%)`;

            if (squeeze.isSqueeze) {
                confidence = Math.min(92, confidence + 8);
                reason += ' + squeeze breakout';
            }

            return {
                signal: 'buy', side: 'buy', confidence,
                reason,
                indicator: { upper: bands.upper.toFixed(2), middle: bands.middle.toFixed(2), lower: bands.lower.toFixed(2), percentB: (percentB * 100).toFixed(1), squeeze: squeeze.isSqueeze }
            };
        }

        // Sell: Price touches or goes above upper band WITH confirmation
        if (currentPrice >= bands.upper || (prevPrice > prevBands.upper && currentPrice < bands.upper)) {
            if (percentBSlope > 0.05 && currentPrice >= bands.upper) {
                return { signal: 'none', confidence: 15, reason: `At upper band but %B still rising (slope: ${percentBSlope.toFixed(3)})` };
            }

            if (!volumeConfirmed) {
                return { signal: 'none', confidence: 15, reason: 'At upper band but low volume — weak signal' };
            }

            const distance = ((currentPrice - bands.upper) / bands.upper) * 100;
            let confidence = Math.min(90, 55 + Math.max(0, distance) * 15);
            let reason = `Price at upper BB (%B: ${(percentB * 100).toFixed(1)}%)`;

            if (squeeze.isSqueeze) {
                confidence = Math.min(92, confidence + 8);
                reason += ' + squeeze breakout';
            }

            return {
                signal: 'sell', side: 'sell', confidence,
                reason,
                indicator: { upper: bands.upper.toFixed(2), middle: bands.middle.toFixed(2), lower: bands.lower.toFixed(2), percentB: (percentB * 100).toFixed(1), squeeze: squeeze.isSqueeze }
            };
        }

        return { signal: 'none', confidence: 0, reason: `Price within bands (%B: ${(percentB * 100).toFixed(1)}%)` };
    }
}

module.exports = BollingerBreakoutStrategy;
