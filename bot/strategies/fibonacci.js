/**
 * Fibonacci Retracement Strategy
 * Buy at 61.8%/50% retracement levels in uptrend, sell at 38.2%/50% in downtrend
 */
class FibonacciStrategy {
    constructor() {
        this.id = 'fibonacci';
        this.name = 'Fibonacci Retracement';
        this.description = 'Buy at Fib 61.8%/50% in uptrend, Sell at 38.2%/50% in downtrend.';
        this.winRate = 60;
        this.timeframe = '1h - 1D';
        this.riskLevel = 'Conservative';
        this.fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
        this.tolerance = 0.5; // % tolerance around fib levels
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    findSwingPoints(highs, lows, lookback = 20) {
        const swingHigh = Math.max(...highs.slice(-lookback));
        const swingLow = Math.min(...lows.slice(-lookback));
        return { high: swingHigh, low: swingLow, range: swingHigh - swingLow };
    }

    determineTrend(closes, period = 20) {
        if (closes.length < period) return 'neutral';
        const recent = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const older = closes.slice(-period, -period + 5).reduce((a, b) => a + b, 0) / 5;
        if (recent > older * 1.01) return 'up';
        if (recent < older * 0.99) return 'down';
        return 'neutral';
    }

    analyze(marketData) {
        const { closes, highs, lows } = marketData;
        if (!closes || !highs || !lows || closes.length < 25) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for Fibonacci' };
        }

        const trend = this.determineTrend(closes);
        const swing = this.findSwingPoints(highs, lows, 20);
        const price = closes[closes.length - 1];
        const prevPrice = closes[closes.length - 2];

        if (swing.range <= 0) {
            return { signal: 'none', confidence: 0, reason: 'No price range for Fibonacci' };
        }

        // Calculate Fibonacci levels
        const fibData = {};
        for (const level of this.fibLevels) {
            if (trend === 'up') {
                // Uptrend: retrace from high
                fibData[level] = swing.high - (swing.range * level);
            } else {
                // Downtrend: retrace from low
                fibData[level] = swing.low + (swing.range * level);
            }
        }

        // Check if price is at a key Fibonacci level
        const checkLevel = (level, fibPrice) => {
            const toleranceAbs = price * (this.tolerance / 100);
            return Math.abs(price - fibPrice) <= toleranceAbs;
        };

        if (trend === 'up') {
            // Buy at 50% or 61.8% retracement in uptrend (bounce)
            if (checkLevel(0.618, fibData[0.618]) && prevPrice < price) {
                return {
                    signal: 'buy', side: 'buy',
                    confidence: Math.min(85, 65),
                    reason: `Price bouncing from Fib 61.8% (${fibData[0.618].toFixed(2)}) in uptrend`,
                    indicator: { fib_618: fibData[0.618].toFixed(2), trend: 'up', price: price.toFixed(2) }
                };
            }
            if (checkLevel(0.5, fibData[0.5]) && prevPrice < price) {
                return {
                    signal: 'buy', side: 'buy',
                    confidence: Math.min(80, 60),
                    reason: `Price bouncing from Fib 50% (${fibData[0.5].toFixed(2)}) in uptrend`,
                    indicator: { fib_50: fibData[0.5].toFixed(2), trend: 'up', price: price.toFixed(2) }
                };
            }
        }

        if (trend === 'down') {
            // Sell at 38.2% or 50% retracement in downtrend (rejection)
            if (checkLevel(0.382, fibData[0.382]) && prevPrice > price) {
                return {
                    signal: 'sell', side: 'sell',
                    confidence: Math.min(80, 62),
                    reason: `Price rejected at Fib 38.2% (${fibData[0.382].toFixed(2)}) in downtrend`,
                    indicator: { fib_382: fibData[0.382].toFixed(2), trend: 'down', price: price.toFixed(2) }
                };
            }
            if (checkLevel(0.5, fibData[0.5]) && prevPrice > price) {
                return {
                    signal: 'sell', side: 'sell',
                    confidence: Math.min(78, 58),
                    reason: `Price rejected at Fib 50% (${fibData[0.5].toFixed(2)}) in downtrend`,
                    indicator: { fib_50: fibData[0.5].toFixed(2), trend: 'down', price: price.toFixed(2) }
                };
            }
        }

        return { signal: 'none', confidence: 0, reason: `Price not at key Fib level (trend: ${trend})` };
    }
}

module.exports = FibonacciStrategy;
