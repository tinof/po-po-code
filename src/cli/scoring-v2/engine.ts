import type { DiscoveredModel, ExternalSignalMap } from '../types';
import { extractFeatureVector } from './features';
import type {
  FeatureVector,
  FeatureWeights,
  ScoredCandidate,
  ScoringAgentName,
} from './types';
import { getFeatureWeights } from './weights';

function weightedFeatures(
  features: FeatureVector,
  weights: FeatureWeights,
): FeatureVector {
  return {
    status: features.status * weights.status,
    context: features.context * weights.context,
    output: features.output * weights.output,
    versionBonus: features.versionBonus * weights.versionBonus,
    reasoning: features.reasoning * weights.reasoning,
    toolcall: features.toolcall * weights.toolcall,
    attachment: features.attachment * weights.attachment,
    quality: features.quality * weights.quality,
    coding: features.coding * weights.coding,
    latencyPenalty: features.latencyPenalty * weights.latencyPenalty,
    pricePenalty: features.pricePenalty * weights.pricePenalty,
  };
}

function sumFeatures(features: FeatureVector): number {
  return (
    features.status +
    features.context +
    features.output +
    features.versionBonus +
    features.reasoning +
    features.toolcall +
    features.attachment +
    features.quality +
    features.coding +
    features.latencyPenalty +
    features.pricePenalty
  );
}

function withStableTieBreak(
  left: ScoredCandidate,
  right: ScoredCandidate,
): number {
  if (left.totalScore !== right.totalScore) {
    return right.totalScore - left.totalScore;
  }

  const providerDelta = left.model.providerID.localeCompare(
    right.model.providerID,
  );
  if (providerDelta !== 0) {
    return providerDelta;
  }

  return left.model.model.localeCompare(right.model.model);
}

export function scoreCandidateV2(
  model: DiscoveredModel,
  agent: ScoringAgentName,
  externalSignals?: ExternalSignalMap,
): ScoredCandidate {
  const features = extractFeatureVector(model, agent, externalSignals);
  const weights = getFeatureWeights(agent);
  const weighted = weightedFeatures(features, weights);

  return {
    model,
    totalScore: Math.round(sumFeatures(weighted) * 1000) / 1000,
    scoreBreakdown: {
      features,
      weighted,
    },
  };
}

export function rankModelsV2(
  models: DiscoveredModel[],
  agent: ScoringAgentName,
  externalSignals?: ExternalSignalMap,
): ScoredCandidate[] {
  return models
    .map((model) => scoreCandidateV2(model, agent, externalSignals))
    .sort(withStableTieBreak);
}
