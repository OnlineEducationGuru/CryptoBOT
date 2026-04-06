/**
 * Multi AI Strategy - Combines ALL strategies with weighted voting
 * The most powerful strategy: requires majority agreement from sub-strategies
 */
class MultiAIStrategy {
    constructor(strategies) {
        this.id = 'multi-ai';
        this.name = 'Multi AI Strategy';
        this.description = 'AI-powered combination of all strategies. Weighted voting system requires majority agreement. Highest accuracy.';
        this.winRate = 72;
        this.timeframe = 'Multi-timeframe';
        this.riskLevel = 'Moderate';
        this.strategies = strategies || [];
        this.minAgreement = 3; // Minimum strategies that must agree
        this.minAvgConfidence = 55; // Minimum average confidence

        // Strategy weights (higher = more influence)
        this.weights = {
            'rsi-reversal': 1.2,      // High weight - reliable reversal signals
            'ema-crossover': 1.0,     // Standard weight
            'macd-momentum': 1.0,     // Standard weight
            'bollinger-breakout': 0.9, // Slightly lower - can be noisy
            'vwap-strategy': 1.3,     // High weight - very reliable intraday
            'scalping': 0.7           // Lower weight - noisy, high frequency
        };
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel,
            subStrategies: this.strategies.length
        };
    }

    setStrategies(strategies) {
        this.strategies = strategies;
    }

    analyze(marketData) {
        if (!this.strategies || this.strategies.length === 0) {
            return { signal: 'none', confidence: 0, reason: 'No sub-strategies configured' };
        }

        const results = [];
        const votes = { buy: [], sell: [], none: [] };

        // Run all strategies
        for (const strategy of this.strategies) {
            try {
                const result = strategy.analyze(marketData);
                const weight = this.weights[strategy.id] || 1.0;
                results.push({
                    strategy: strategy.name,
                    id: strategy.id,
                    signal: result.signal,
                    confidence: result.confidence,
                    weight,
                    weightedConfidence: result.confidence * weight,
                    reason: result.reason
                });

                if (result.signal !== 'none' && result.confidence > 30) {
                    votes[result.signal].push({
                        strategy: strategy.name,
                        confidence: result.confidence,
                        weight,
                        weightedConfidence: result.confidence * weight
                    });
                } else {
                    votes.none.push({ strategy: strategy.name });
                }
            } catch (err) {
                results.push({
                    strategy: strategy.name,
                    id: strategy.id,
                    signal: 'error',
                    confidence: 0,
                    reason: err.message
                });
            }
        }

        // Determine consensus
        const buyVotes = votes.buy.length;
        const sellVotes = votes.sell.length;
        const totalActive = buyVotes + sellVotes;

        // Need minimum agreement
        let signal = 'none';
        let agreeing = [];

        if (buyVotes >= this.minAgreement && buyVotes > sellVotes) {
            signal = 'buy';
            agreeing = votes.buy;
        } else if (sellVotes >= this.minAgreement && sellVotes > buyVotes) {
            signal = 'sell';
            agreeing = votes.sell;
        }

        if (signal === 'none') {
            return {
                signal: 'none',
                confidence: 0,
                reason: `No consensus: ${buyVotes} buy, ${sellVotes} sell, ${votes.none.length} neutral. Need ${this.minAgreement}+ agreement.`,
                details: results
            };
        }

        // Calculate weighted average confidence
        const totalWeight = agreeing.reduce((sum, v) => sum + v.weight, 0);
        const weightedConfidence = agreeing.reduce((sum, v) => sum + v.weightedConfidence, 0) / totalWeight;

        if (weightedConfidence < this.minAvgConfidence) {
            return {
                signal: 'none',
                confidence: weightedConfidence,
                reason: `${signal.toUpperCase()} consensus (${agreeing.length}/${this.strategies.length}) but confidence too low (${weightedConfidence.toFixed(1)}% < ${this.minAvgConfidence}%)`,
                details: results
            };
        }

        // Apply consensus bonus: more strategies agreeing = higher confidence
        const consensusBonus = Math.min(15, (agreeing.length - this.minAgreement) * 5);
        const finalConfidence = Math.min(98, weightedConfidence + consensusBonus);

        const strategyNames = agreeing.map(v => v.strategy).join(', ');

        return {
            signal,
            side: signal,
            confidence: Math.round(finalConfidence),
            reason: `Multi AI ${signal.toUpperCase()}: ${agreeing.length}/${this.strategies.length} strategies agree (${strategyNames}). Weighted confidence: ${finalConfidence.toFixed(1)}%`,
            details: results,
            agreementCount: agreeing.length,
            totalStrategies: this.strategies.length
        };
    }
}

module.exports = MultiAIStrategy;
