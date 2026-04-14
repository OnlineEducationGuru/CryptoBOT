/**
 * Elliott Wave Approximation Strategy
 * Detects 5-wave impulse patterns and 3-wave corrections
 * Uses Fibonacci ratios for wave validation
 */
class ElliottWaveStrategy {
    constructor() {
        this.id = 'elliott-wave';
        this.name = 'Elliott Wave';
        this.description = 'Approximates Elliott Wave patterns (5-wave impulse + 3-wave correction) with Fibonacci validation.';
        this.winRate = 60;
        this.timeframe = '1h - 4h';
        this.riskLevel = 'Aggressive';
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    // Find local swing highs and lows
    findSwingPoints(closes, lookback = 3) {
        const swings = [];
        for (let i = lookback; i < closes.length - lookback; i++) {
            const left = closes.slice(i - lookback, i);
            const right = closes.slice(i + 1, i + lookback + 1);
            const point = closes[i];

            const isHigh = left.every(l => l < point) && right.every(r => r < point);
            const isLow = left.every(l => l > point) && right.every(r => r > point);

            if (isHigh) swings.push({ index: i, price: point, type: 'high' });
            if (isLow) swings.push({ index: i, price: point, type: 'low' });
        }
        return swings;
    }

    // Check Fibonacci ratio between two moves
    checkFibRatio(move1, move2, targetRatios = [0.382, 0.5, 0.618, 0.786]) {
        if (move1 === 0) return { valid: false };
        const ratio = Math.abs(move2 / move1);
        for (const target of targetRatios) {
            if (Math.abs(ratio - target) < 0.1) {
                return { valid: true, ratio: ratio.toFixed(3), nearestFib: target };
            }
        }
        return { valid: false, ratio: ratio.toFixed(3) };
    }

    // Detect bullish impulse (5 waves up)
    detectBullishImpulse(swings) {
        if (swings.length < 6) return null;

        // Look for pattern: low-high-low-high-low-high (5 waves up)
        const recent = swings.slice(-6);
        
        // Check alternating pattern
        for (let i = 0; i < recent.length - 1; i++) {
            if (recent[i].type === recent[i + 1].type) return null;
        }

        // Wave structure for bullish: L1 H1 L2 H2 L3 H3
        if (recent[0].type !== 'low') return null;

        const wave1 = recent[1].price - recent[0].price; // L1 to H1
        const wave2 = recent[1].price - recent[2].price; // H1 to L2 (correction)
        const wave3 = recent[3].price - recent[2].price; // L2 to H2
        const wave4 = recent[3].price - recent[4].price; // H2 to L3 (correction)
        const wave5 = recent[5].price - recent[4].price; // L3 to H3

        // Elliott rules:
        // 1. Wave 2 can't retrace more than wave 1
        if (wave2 > wave1) return null;
        // 2. Wave 3 shouldn't be the shortest
        if (wave3 < wave1 && wave3 < wave5) return null;
        // 3. All impulse waves should be positive
        if (wave1 <= 0 || wave3 <= 0 || wave5 <= 0) return null;

        // Check Fibonacci relationships
        const w2Fib = this.checkFibRatio(wave1, wave2, [0.382, 0.5, 0.618]);
        const w4Fib = this.checkFibRatio(wave3, wave4, [0.236, 0.382, 0.5]);

        return {
            detected: true,
            type: 'bullish',
            waves: { wave1, wave2, wave3, wave4, wave5 },
            fibValid: w2Fib.valid || w4Fib.valid,
            w2Ratio: w2Fib.ratio,
            w4Ratio: w4Fib.ratio
        };
    }

    // Detect bearish impulse (5 waves down)
    detectBearishImpulse(swings) {
        if (swings.length < 6) return null;

        const recent = swings.slice(-6);
        for (let i = 0; i < recent.length - 1; i++) {
            if (recent[i].type === recent[i + 1].type) return null;
        }

        if (recent[0].type !== 'high') return null;

        const wave1 = recent[0].price - recent[1].price; // H1 to L1
        const wave2 = recent[2].price - recent[1].price; // L1 to H2 (correction)
        const wave3 = recent[2].price - recent[3].price; // H2 to L2
        const wave4 = recent[4].price - recent[3].price; // L2 to H3 (correction)
        const wave5 = recent[4].price - recent[5].price; // H3 to L3

        if (wave2 > wave1) return null;
        if (wave3 < wave1 && wave3 < wave5) return null;
        if (wave1 <= 0 || wave3 <= 0 || wave5 <= 0) return null;

        const w2Fib = this.checkFibRatio(wave1, wave2, [0.382, 0.5, 0.618]);
        const w4Fib = this.checkFibRatio(wave3, wave4, [0.236, 0.382, 0.5]);

        return {
            detected: true,
            type: 'bearish',
            waves: { wave1, wave2, wave3, wave4, wave5 },
            fibValid: w2Fib.valid || w4Fib.valid,
            w2Ratio: w2Fib.ratio,
            w4Ratio: w4Fib.ratio
        };
    }

    // Detect ABC correction  
    detectABCCorrection(swings, trendDirection) {
        if (swings.length < 4) return null;
        const recent = swings.slice(-4);

        if (trendDirection === 'up') {
            // After bullish impulse, expect A-down B-up C-down
            if (recent[0].type !== 'high') return null;
            const waveA = recent[0].price - recent[1].price;
            const waveB = recent[2].price - recent[1].price;
            const waveC = recent[2].price - recent[3].price;
            if (waveA <= 0 || waveC <= 0) return null;
            if (waveB > waveA) return null;

            const bcFib = this.checkFibRatio(waveA, waveC, [0.618, 1.0, 1.272, 1.618]);
            return { detected: true, type: 'abc-correction-done', fibValid: bcFib.valid };
        }
        return null;
    }

    analyze(marketData) {
        const { closes } = marketData;
        if (!closes || closes.length < 30) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for Elliott Wave' };
        }

        const swings = this.findSwingPoints(closes, 2);
        if (swings.length < 6) {
            return { signal: 'none', confidence: 0, reason: `Only ${swings.length} swing points found (need 6+)` };
        }

        // Check for completed bullish impulse followed by correction (BUY at correction end)
        const bullishImpulse = this.detectBullishImpulse(swings.slice(0, -2));
        if (bullishImpulse?.detected) {
            const abc = this.detectABCCorrection(swings.slice(-4), 'up');
            if (abc?.detected) {
                let confidence = 55;
                let reasons = ['5-wave bullish impulse completed + ABC correction done'];
                if (bullishImpulse.fibValid) { confidence += 12; reasons.push('Fibonacci ratios valid'); }
                if (abc.fibValid) { confidence += 8; reasons.push('ABC Fibonacci confirmed'); }

                return {
                    signal: 'buy', side: 'buy',
                    confidence: Math.min(88, confidence),
                    reason: `Elliott Wave BUY: ${reasons.join(' + ')} (W2: ${bullishImpulse.w2Ratio}, W4: ${bullishImpulse.w4Ratio})`,
                    indicator: { pattern: 'bullish-impulse-abc', ...bullishImpulse.waves }
                };
            }
        }

        // Check for current bullish wave 3 (strongest wave — ride it)
        const partialBullish = this.detectBullishImpulse(swings);
        if (partialBullish?.detected && partialBullish.waves.wave3 > partialBullish.waves.wave1) {
            let confidence = 50;
            let reasons = ['In bullish wave 3 (strongest wave)'];
            if (partialBullish.fibValid) { confidence += 10; reasons.push('Fibonacci confirmed'); }
            if (partialBullish.waves.wave3 > partialBullish.waves.wave1 * 1.618) {
                confidence += 8;
                reasons.push('Wave 3 extended (1.618x W1)');
            }

            if (confidence >= 58) {
                return {
                    signal: 'buy', side: 'buy',
                    confidence: Math.min(85, confidence),
                    reason: `Elliott Wave BUY: ${reasons.join(' + ')}`,
                    indicator: { pattern: 'wave3-ride', ...partialBullish.waves }
                };
            }
        }

        // Bearish impulse
        const bearishImpulse = this.detectBearishImpulse(swings);
        if (bearishImpulse?.detected) {
            let confidence = 50;
            let reasons = ['5-wave bearish impulse detected'];
            if (bearishImpulse.fibValid) { confidence += 12; reasons.push('Fibonacci ratios valid'); }
            if (bearishImpulse.waves.wave3 > bearishImpulse.waves.wave1 * 1.618) {
                confidence += 8;
                reasons.push('Wave 3 extended');
            }

            if (confidence >= 58) {
                return {
                    signal: 'sell', side: 'sell',
                    confidence: Math.min(85, confidence),
                    reason: `Elliott Wave SELL: ${reasons.join(' + ')} (W2: ${bearishImpulse.w2Ratio}, W4: ${bearishImpulse.w4Ratio})`,
                    indicator: { pattern: 'bearish-impulse', ...bearishImpulse.waves }
                };
            }
        }

        return { signal: 'none', confidence: 0, reason: `Elliott Wave: ${swings.length} swings found, no clear pattern` };
    }
}

module.exports = ElliottWaveStrategy;
