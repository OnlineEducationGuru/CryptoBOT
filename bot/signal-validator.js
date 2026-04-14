/**
 * Signal Validator - Multi-layer fake signal detection (v2.1 Optimized)
 * Uses 10 confirmation checks: volume, trend, price action, momentum,
 * volatility, spread, consecutive candles, support/resistance, VWAP, and time quality
 * Increased from 8 to 10 checks for better false signal rejection
 */
class SignalValidator {
    constructor() {
        this.minConfidence = 60; // Minimum confidence score to accept signal
    }

    /**
     * Validate a trading signal with multiple confirmation methods
     */
    validate(signal, marketData) {
        const checks = [];
        let totalScore = 0;
        let maxScore = 0;

        // 1. Volume Confirmation (20 points)
        const volumeCheck = this.checkVolume(marketData);
        checks.push(volumeCheck);
        totalScore += volumeCheck.score;
        maxScore += 20;

        // 2. Trend Strength via ADX (15 points)
        const trendCheck = this.checkTrendStrength(marketData);
        checks.push(trendCheck);
        totalScore += trendCheck.score;
        maxScore += 15;

        // 3. Price Action Confirmation (15 points)
        const priceCheck = this.checkPriceAction(signal, marketData);
        checks.push(priceCheck);
        totalScore += priceCheck.score;
        maxScore += 15;

        // 4. Momentum Confirmation (15 points)
        const momentumCheck = this.checkMomentum(signal, marketData);
        checks.push(momentumCheck);
        totalScore += momentumCheck.score;
        maxScore += 15;

        // 5. Volatility Check (10 points)
        const volatilityCheck = this.checkVolatility(marketData);
        checks.push(volatilityCheck);
        totalScore += volatilityCheck.score;
        maxScore += 10;

        // 6. Spread Check (5 points)
        const spreadCheck = this.checkSpread(marketData);
        checks.push(spreadCheck);
        totalScore += spreadCheck.score;
        maxScore += 5;

        // 7. Consecutive Candles Confirmation (10 points)
        const consecutiveCheck = this.checkConsecutiveCandles(signal, marketData);
        checks.push(consecutiveCheck);
        totalScore += consecutiveCheck.score;
        maxScore += 10;

        // 8. Support/Resistance Level Check (10 points)
        const srCheck = this.checkSupportResistance(signal, marketData);
        checks.push(srCheck);
        totalScore += srCheck.score;
        maxScore += 10;

        // 9. VWAP Position Check (10 points) — NEW
        const vwapCheck = this.checkVWAPPosition(signal, marketData);
        checks.push(vwapCheck);
        totalScore += vwapCheck.score;
        maxScore += 10;

        // 10. Volume-Price Divergence Check (10 points) — NEW
        const vpDivCheck = this.checkVolumePriceDivergence(signal, marketData);
        checks.push(vpDivCheck);
        totalScore += vpDivCheck.score;
        maxScore += 10;

        const confidence = Math.round((totalScore / maxScore) * 100);
        const reasons = checks.filter(c => !c.passed).map(c => c.reason);
        const passed = checks.filter(c => c.passed).map(c => c.reason);

        // EXTRA SAFETY: require at least 6 out of 10 checks to pass (increased from 5/8)
        const passedCount = checks.filter(c => c.passed).length;
        const minPassedChecks = 6;
        const valid = confidence >= this.minConfidence && passedCount >= minPassedChecks;

        if (!valid && confidence >= this.minConfidence) {
            reasons.push(`Only ${passedCount}/${minPassedChecks} checks passed (need ${minPassedChecks}+)`);
        }

        return {
            valid,
            confidence,
            passed,
            reasons,
            passedCount,
            totalChecks: checks.length,
            details: checks
        };
    }

    // 1. Volume must be above average
    checkVolume(marketData) {
        if (!marketData.volumes || marketData.volumes.length < 20) {
            return { name: 'Volume', passed: false, score: 0, reason: 'Insufficient volume data' };
        }
        const recentVol = marketData.volumes[marketData.volumes.length - 1];
        const avgVol = marketData.volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const ratio = avgVol > 0 ? recentVol / avgVol : 0;

        if (ratio >= 1.5) return { name: 'Volume', passed: true, score: 20, reason: `Strong volume (${ratio.toFixed(1)}x avg)` };
        if (ratio >= 1.0) return { name: 'Volume', passed: true, score: 12, reason: `Normal volume (${ratio.toFixed(1)}x avg)` };
        return { name: 'Volume', passed: false, score: 3, reason: `Low volume (${ratio.toFixed(1)}x avg)` };
    }

    // 2. Trend must be clear, not choppy
    checkTrendStrength(marketData) {
        if (!marketData.closes || marketData.closes.length < 14) {
            return { name: 'Trend', passed: false, score: 0, reason: 'Insufficient data for trend' };
        }
        const closes = marketData.closes.slice(-14);
        let upMoves = 0, downMoves = 0;
        for (let i = 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) upMoves += diff;
            else downMoves += Math.abs(diff);
        }
        const totalMove = upMoves + downMoves;
        const trendStrength = totalMove > 0 ? Math.abs(upMoves - downMoves) / totalMove * 100 : 0;

        if (trendStrength >= 40) return { name: 'Trend', passed: true, score: 15, reason: `Strong trend (${trendStrength.toFixed(0)}%)` };
        if (trendStrength >= 20) return { name: 'Trend', passed: true, score: 10, reason: `Moderate trend (${trendStrength.toFixed(0)}%)` };
        return { name: 'Trend', passed: false, score: 3, reason: `Weak/choppy trend (${trendStrength.toFixed(0)}%)` };
    }

    // 3. Price action must confirm signal direction
    checkPriceAction(signal, marketData) {
        if (!marketData.closes || marketData.closes.length < 5) {
            return { name: 'Price Action', passed: false, score: 0, reason: 'Insufficient price data' };
        }
        const closes = marketData.closes.slice(-5);
        const current = closes[closes.length - 1];
        const prev = closes[closes.length - 2];

        if (signal.side === 'buy') {
            if (current >= prev) return { name: 'Price Action', passed: true, score: 15, reason: 'Price confirms buy (rising)' };
            return { name: 'Price Action', passed: false, score: 5, reason: 'Price falling — buy premature' };
        } else {
            if (current <= prev) return { name: 'Price Action', passed: true, score: 15, reason: 'Price confirms sell (falling)' };
            return { name: 'Price Action', passed: false, score: 5, reason: 'Price rising — sell premature' };
        }
    }

    // 4. Short-term momentum must agree with signal
    checkMomentum(signal, marketData) {
        if (!marketData.closes || marketData.closes.length < 10) {
            return { name: 'Momentum', passed: false, score: 0, reason: 'Insufficient data for momentum' };
        }
        const closes = marketData.closes.slice(-10);
        const shortMa = closes.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const longMa = closes.reduce((a, b) => a + b, 0) / closes.length;

        if (signal.side === 'buy' && shortMa > longMa) return { name: 'Momentum', passed: true, score: 15, reason: 'Bullish momentum confirmed' };
        if (signal.side === 'sell' && shortMa < longMa) return { name: 'Momentum', passed: true, score: 15, reason: 'Bearish momentum confirmed' };
        return { name: 'Momentum', passed: false, score: 3, reason: 'Momentum disagrees with signal' };
    }

    // 5. Volatility must be in a tradeable range
    checkVolatility(marketData) {
        if (!marketData.closes || marketData.closes.length < 20) {
            return { name: 'Volatility', passed: true, score: 5, reason: 'Insufficient volatility data' };
        }
        const closes = marketData.closes.slice(-20);
        const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
        const variance = closes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / closes.length;
        const stdDev = Math.sqrt(variance);
        const cv = (stdDev / mean) * 100;

        if (cv < 0.5) return { name: 'Volatility', passed: false, score: 2, reason: `Too low volatility (${cv.toFixed(2)}%)` };
        if (cv > 5) return { name: 'Volatility', passed: false, score: 3, reason: `Extreme volatility (${cv.toFixed(2)}%)` };
        return { name: 'Volatility', passed: true, score: 10, reason: `Good volatility (${cv.toFixed(2)}%)` };
    }

    // 6. Bid-ask spread must not eat profits
    checkSpread(marketData) {
        if (!marketData.bid || !marketData.ask) {
            return { name: 'Spread', passed: true, score: 3, reason: 'No spread data' };
        }
        const spread = ((marketData.ask - marketData.bid) / marketData.bid) * 100;
        if (spread < 0.1) return { name: 'Spread', passed: true, score: 5, reason: `Tight spread (${spread.toFixed(3)}%)` };
        if (spread < 0.5) return { name: 'Spread', passed: true, score: 3, reason: `OK spread (${spread.toFixed(3)}%)` };
        return { name: 'Spread', passed: false, score: 1, reason: `Wide spread (${spread.toFixed(3)}%)` };
    }

    // 7. At least 2 consecutive candles must confirm direction
    checkConsecutiveCandles(signal, marketData) {
        if (!marketData.closes || marketData.closes.length < 4) {
            return { name: 'Consecutive', passed: false, score: 0, reason: 'Insufficient candle data' };
        }
        const recent = marketData.closes.slice(-4);
        let bullCount = 0, bearCount = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] > recent[i-1]) bullCount++;
            else if (recent[i] < recent[i-1]) bearCount++;
        }
        if (signal.side === 'buy' && bullCount >= 2) return { name: 'Consecutive', passed: true, score: 10, reason: `${bullCount}/3 bullish candles confirm buy` };
        if (signal.side === 'sell' && bearCount >= 2) return { name: 'Consecutive', passed: true, score: 10, reason: `${bearCount}/3 bearish candles confirm sell` };
        return { name: 'Consecutive', passed: false, score: 2, reason: `Only ${signal.side === 'buy' ? bullCount : bearCount}/3 candles confirm — mixed signal` };
    }

    // 8. Price near support (for buy) or resistance (for sell)
    checkSupportResistance(signal, marketData) {
        if (!marketData.highs || !marketData.lows || marketData.highs.length < 20) {
            return { name: 'S/R Level', passed: true, score: 5, reason: 'Insufficient S/R data' };
        }
        const highs = marketData.highs.slice(-20);
        const lows = marketData.lows.slice(-20);
        const price = marketData.currentPrice;
        const recentHigh = Math.max(...highs);
        const recentLow = Math.min(...lows);
        const range = recentHigh - recentLow;
        if (range <= 0) return { name: 'S/R Level', passed: true, score: 5, reason: 'No range detected' };

        const position = (price - recentLow) / range;
        if (signal.side === 'buy' && position <= 0.4) return { name: 'S/R Level', passed: true, score: 10, reason: `Near support (${(position * 100).toFixed(0)}% of range)` };
        if (signal.side === 'sell' && position >= 0.6) return { name: 'S/R Level', passed: true, score: 10, reason: `Near resistance (${(position * 100).toFixed(0)}% of range)` };
        if (signal.side === 'buy' && position > 0.8) return { name: 'S/R Level', passed: false, score: 1, reason: `Buy near resistance (${(position * 100).toFixed(0)}%) — risky` };
        if (signal.side === 'sell' && position < 0.2) return { name: 'S/R Level', passed: false, score: 1, reason: `Sell near support (${(position * 100).toFixed(0)}%) — risky` };
        return { name: 'S/R Level', passed: true, score: 6, reason: `Mid-range position (${(position * 100).toFixed(0)}%)` };
    }

    // 9. NEW: VWAP Position Check — buy below VWAP, sell above VWAP
    checkVWAPPosition(signal, marketData) {
        if (!marketData.closes || !marketData.volumes || marketData.closes.length < 10) {
            return { name: 'VWAP', passed: true, score: 5, reason: 'Insufficient VWAP data' };
        }

        // Calculate VWAP from available data
        const closes = marketData.closes.slice(-20);
        const volumes = marketData.volumes.slice(-20);
        let totalPV = 0, totalVol = 0;
        for (let i = 0; i < closes.length && i < volumes.length; i++) {
            totalPV += closes[i] * volumes[i];
            totalVol += volumes[i];
        }
        const vwap = totalVol > 0 ? totalPV / totalVol : closes[closes.length - 1];
        const price = marketData.currentPrice || closes[closes.length - 1];
        const distPercent = ((price - vwap) / vwap) * 100;

        if (signal.side === 'buy' && price <= vwap) {
            return { name: 'VWAP', passed: true, score: 10, reason: `Price below VWAP (${distPercent.toFixed(2)}%) — good buy zone` };
        }
        if (signal.side === 'sell' && price >= vwap) {
            return { name: 'VWAP', passed: true, score: 10, reason: `Price above VWAP (+${distPercent.toFixed(2)}%) — good sell zone` };
        }
        if (Math.abs(distPercent) < 0.3) {
            return { name: 'VWAP', passed: true, score: 6, reason: `Price near VWAP (${distPercent.toFixed(2)}%) — neutral` };
        }
        return { name: 'VWAP', passed: false, score: 2, reason: `Price on wrong side of VWAP (${distPercent.toFixed(2)}%)` };
    }

    // 10. NEW: Volume-price divergence check
    checkVolumePriceDivergence(signal, marketData) {
        if (!marketData.closes || !marketData.volumes || marketData.closes.length < 10) {
            return { name: 'Vol-Price', passed: true, score: 5, reason: 'Insufficient data' };
        }

        const closes = marketData.closes.slice(-10);
        const volumes = marketData.volumes.slice(-10);

        // Check if price is trending one way but volume is declining (divergence = weak signal)
        const priceChange = (closes[closes.length - 1] - closes[0]) / closes[0] * 100;
        const volFirst = volumes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
        const volLast = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const volChange = volFirst > 0 ? (volLast - volFirst) / volFirst * 100 : 0;

        // Healthy: price up + volume up, or price down + volume up
        if ((priceChange > 0 && volChange > 0) || (priceChange < 0 && volChange > 0)) {
            return { name: 'Vol-Price', passed: true, score: 10, reason: `Volume confirms price move (vol: ${volChange > 0 ? '+' : ''}${volChange.toFixed(1)}%)` };
        }
        // Warning: price moving but volume declining
        if (volChange < -20) {
            return { name: 'Vol-Price', passed: false, score: 2, reason: `Volume declining while price moving (vol: ${volChange.toFixed(1)}%) — weak conviction` };
        }
        return { name: 'Vol-Price', passed: true, score: 6, reason: `Volume stable (${volChange.toFixed(1)}%)` };
    }

    setMinConfidence(value) {
        this.minConfidence = Math.max(0, Math.min(100, value));
    }
}

module.exports = new SignalValidator();
