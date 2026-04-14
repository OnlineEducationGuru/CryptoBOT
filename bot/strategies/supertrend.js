/**
 * Supertrend Strategy
 * ATR-based trend following indicator. Very popular in Indian crypto/stock trading.
 * Direction changes = trade signals
 */
class SupertrendStrategy {
    constructor() {
        this.id = 'supertrend';
        this.name = 'Supertrend';
        this.description = 'ATR-based trend indicator. Direction changes trigger trades. Very popular.';
        this.winRate = 63;
        this.timeframe = '15m - 4h';
        this.riskLevel = 'Moderate';
        this.atrPeriod = 10;
        this.multiplier = 3;
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    calculateATR(highs, lows, closes, period) {
        if (highs.length < period + 1) return [];
        const trueRanges = [];
        for (let i = 1; i < highs.length; i++) {
            const tr = Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            );
            trueRanges.push(tr);
        }

        const atr = [trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period];
        for (let i = period; i < trueRanges.length; i++) {
            atr.push((atr[atr.length - 1] * (period - 1) + trueRanges[i]) / period);
        }
        return atr;
    }

    calculateSupertrend(highs, lows, closes) {
        const atrValues = this.calculateATR(highs, lows, closes, this.atrPeriod);
        if (atrValues.length < 2) return null;

        const offset = closes.length - atrValues.length - 1;
        const supertrend = [];
        let prevUpperBand = 0, prevLowerBand = 0;
        let prevDirection = 1; // 1 = bullish, -1 = bearish

        for (let i = 0; i < atrValues.length; i++) {
            const ci = i + offset + 1;
            const hl2 = (highs[ci] + lows[ci]) / 2;
            let upperBand = hl2 + this.multiplier * atrValues[i];
            let lowerBand = hl2 - this.multiplier * atrValues[i];

            // Adjust bands
            if (i > 0) {
                upperBand = upperBand < prevUpperBand || closes[ci - 1] > prevUpperBand ? upperBand : prevUpperBand;
                lowerBand = lowerBand > prevLowerBand || closes[ci - 1] < prevLowerBand ? lowerBand : prevLowerBand;
            }

            // Direction
            let direction;
            if (i === 0) {
                direction = closes[ci] > upperBand ? 1 : -1;
            } else {
                if (prevDirection === 1 && closes[ci] < lowerBand) direction = -1;
                else if (prevDirection === -1 && closes[ci] > upperBand) direction = 1;
                else direction = prevDirection;
            }

            supertrend.push({
                value: direction === 1 ? lowerBand : upperBand,
                direction,
                upper: upperBand,
                lower: lowerBand
            });

            prevUpperBand = upperBand;
            prevLowerBand = lowerBand;
            prevDirection = direction;
        }

        return supertrend;
    }

    analyze(marketData) {
        const { closes, highs, lows } = marketData;
        if (!closes || !highs || !lows || closes.length < this.atrPeriod + 5) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for Supertrend' };
        }

        const st = this.calculateSupertrend(highs, lows, closes);
        if (!st || st.length < 2) {
            return { signal: 'none', confidence: 0, reason: 'Cannot calculate Supertrend' };
        }

        const current = st[st.length - 1];
        const prev = st[st.length - 2];
        const price = closes[closes.length - 1];

        // Direction change = signal
        if (prev.direction === -1 && current.direction === 1) {
            const distance = ((price - current.value) / current.value) * 100;
            const confidence = Math.min(88, 60 + distance * 5);
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `Supertrend flipped BULLISH (support: ${current.value.toFixed(2)})`,
                indicator: { supertrend: current.value.toFixed(2), direction: 'up', distance: distance.toFixed(2) + '%' }
            };
        }

        if (prev.direction === 1 && current.direction === -1) {
            const distance = ((current.value - price) / current.value) * 100;
            const confidence = Math.min(88, 60 + distance * 5);
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `Supertrend flipped BEARISH (resistance: ${current.value.toFixed(2)})`,
                indicator: { supertrend: current.value.toFixed(2), direction: 'down', distance: distance.toFixed(2) + '%' }
            };
        }

        const dir = current.direction === 1 ? 'bullish' : 'bearish';
        return { signal: 'none', confidence: 0, reason: `Supertrend ${dir} — no direction change` };
    }
}

module.exports = SupertrendStrategy;
