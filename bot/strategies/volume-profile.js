/**
 * Volume Profile Strategy
 * Identifies Value Area High/Low and Point of Control (POC)
 * Trades rejections from key volume levels
 */
class VolumeProfileStrategy {
    constructor() {
        this.id = 'volume-profile';
        this.name = 'Volume Profile';
        this.description = 'Identifies POC, Value Area High/Low from volume distribution. Trades level rejections and breakouts.';
        this.winRate = 63;
        this.timeframe = '15m - 1h';
        this.riskLevel = 'Moderate';
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    // Build volume profile from candle data
    buildProfile(closes, highs, lows, volumes, bins = 20) {
        const allPrices = [...highs, ...lows];
        const maxPrice = Math.max(...allPrices);
        const minPrice = Math.min(...allPrices);
        const range = maxPrice - minPrice;
        if (range <= 0) return null;

        const binSize = range / bins;
        const profile = new Array(bins).fill(0);
        const binPrices = [];

        for (let i = 0; i < bins; i++) {
            binPrices.push(minPrice + binSize * (i + 0.5));
        }

        // Distribute volume across price levels
        for (let i = 0; i < closes.length; i++) {
            const low = lows[i];
            const high = highs[i];
            const vol = volumes[i];
            const candleRange = high - low;
            if (candleRange <= 0) continue;

            for (let bin = 0; bin < bins; bin++) {
                const binLow = minPrice + binSize * bin;
                const binHigh = binLow + binSize;
                // Check overlap between candle range and bin
                const overlapLow = Math.max(low, binLow);
                const overlapHigh = Math.min(high, binHigh);
                if (overlapHigh > overlapLow) {
                    const overlapRatio = (overlapHigh - overlapLow) / candleRange;
                    profile[bin] += vol * overlapRatio;
                }
            }
        }

        // Find POC (Point of Control — highest volume bin)
        let pocIndex = 0;
        let maxVol = 0;
        for (let i = 0; i < bins; i++) {
            if (profile[i] > maxVol) {
                maxVol = profile[i];
                pocIndex = i;
            }
        }

        // Calculate Value Area (70% of volume)
        const totalVol = profile.reduce((a, b) => a + b, 0);
        const targetVol = totalVol * 0.7;
        let vaVol = profile[pocIndex];
        let vaLow = pocIndex;
        let vaHigh = pocIndex;

        while (vaVol < targetVol && (vaLow > 0 || vaHigh < bins - 1)) {
            const addLow = vaLow > 0 ? profile[vaLow - 1] : 0;
            const addHigh = vaHigh < bins - 1 ? profile[vaHigh + 1] : 0;
            if (addLow >= addHigh && vaLow > 0) {
                vaLow--;
                vaVol += addLow;
            } else if (vaHigh < bins - 1) {
                vaHigh++;
                vaVol += addHigh;
            } else {
                vaLow--;
                vaVol += addLow;
            }
        }

        return {
            poc: binPrices[pocIndex],
            pocVolume: maxVol,
            valueAreaHigh: minPrice + binSize * (vaHigh + 1),
            valueAreaLow: minPrice + binSize * vaLow,
            maxPrice,
            minPrice,
            totalVolume: totalVol,
            profile,
            binPrices
        };
    }

    analyze(marketData) {
        const { closes, highs, lows, volumes, currentPrice } = marketData;
        if (!closes || closes.length < 30 || !volumes || volumes.length < 30) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for volume profile' };
        }

        const vp = this.buildProfile(closes, highs, lows, volumes);
        if (!vp) return { signal: 'none', confidence: 0, reason: 'Cannot build volume profile' };

        const price = currentPrice || closes[closes.length - 1];
        const priceRange = vp.maxPrice - vp.minPrice;
        if (priceRange <= 0) return { signal: 'none', confidence: 0, reason: 'No price range' };

        // Recent price action
        const prevClose = closes[closes.length - 2];
        const priceDirection = price > prevClose ? 'up' : 'down';

        // Distance from key levels (as % of range)
        const distFromPOC = Math.abs(price - vp.poc) / priceRange * 100;
        const distFromVAH = Math.abs(price - vp.valueAreaHigh) / priceRange * 100;
        const distFromVAL = Math.abs(price - vp.valueAreaLow) / priceRange * 100;

        // Volume trend
        const recentVol = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const volRatio = avgVol > 0 ? recentVol / avgVol : 1;

        // === BUY: Price at VAL and bouncing up ===
        if (price <= vp.valueAreaLow * 1.01 && priceDirection === 'up') {
            let confidence = 50;
            let reasons = [`Price at Value Area Low ($${vp.valueAreaLow.toFixed(2)})`];

            if (price > vp.valueAreaLow) { confidence += 10; reasons.push('Bouncing above VAL'); }
            if (volRatio > 1.0) { confidence += 8; reasons.push(`Volume increasing (${volRatio.toFixed(1)}x)`); }
            if (distFromPOC < 30) { confidence += 5; reasons.push('Near POC support'); }

            return {
                signal: 'buy', side: 'buy',
                confidence: Math.min(90, confidence),
                reason: `Vol Profile BUY: ${reasons.join(' + ')} | POC: $${vp.poc.toFixed(2)}`,
                indicator: { poc: vp.poc, vah: vp.valueAreaHigh, val: vp.valueAreaLow }
            };
        }

        // === SELL: Price at VAH and falling ===
        if (price >= vp.valueAreaHigh * 0.99 && priceDirection === 'down') {
            let confidence = 50;
            let reasons = [`Price at Value Area High ($${vp.valueAreaHigh.toFixed(2)})`];

            if (price < vp.valueAreaHigh) { confidence += 10; reasons.push('Rejecting from VAH'); }
            if (volRatio > 1.0) { confidence += 8; reasons.push(`Volume increasing (${volRatio.toFixed(1)}x)`); }
            if (distFromPOC < 30) { confidence += 5; reasons.push('Near POC resistance'); }

            return {
                signal: 'sell', side: 'sell',
                confidence: Math.min(90, confidence),
                reason: `Vol Profile SELL: ${reasons.join(' + ')} | POC: $${vp.poc.toFixed(2)}`,
                indicator: { poc: vp.poc, vah: vp.valueAreaHigh, val: vp.valueAreaLow }
            };
        }

        // === BUY: Breakout above VAH with volume ===
        if (price > vp.valueAreaHigh && prevClose <= vp.valueAreaHigh && volRatio > 1.3) {
            return {
                signal: 'buy', side: 'buy',
                confidence: Math.min(85, 55 + volRatio * 10),
                reason: `Vol Profile BREAKOUT BUY: Price broke above VAH ($${vp.valueAreaHigh.toFixed(2)}) with ${volRatio.toFixed(1)}x volume`,
                indicator: { poc: vp.poc, vah: vp.valueAreaHigh, val: vp.valueAreaLow }
            };
        }

        // === SELL: Breakdown below VAL with volume ===
        if (price < vp.valueAreaLow && prevClose >= vp.valueAreaLow && volRatio > 1.3) {
            return {
                signal: 'sell', side: 'sell',
                confidence: Math.min(85, 55 + volRatio * 10),
                reason: `Vol Profile BREAKDOWN SELL: Price broke below VAL ($${vp.valueAreaLow.toFixed(2)}) with ${volRatio.toFixed(1)}x volume`,
                indicator: { poc: vp.poc, vah: vp.valueAreaHigh, val: vp.valueAreaLow }
            };
        }

        return { signal: 'none', confidence: 0, reason: `Vol Profile: Price at $${price.toFixed(2)}, POC $${vp.poc.toFixed(2)}, VAH $${vp.valueAreaHigh.toFixed(2)}, VAL $${vp.valueAreaLow.toFixed(2)}` };
    }
}

module.exports = VolumeProfileStrategy;
