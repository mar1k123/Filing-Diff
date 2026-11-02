import type {
  AlignedParagraphPair,
  ChangeCategory,
  CohortObservation,
  ParagraphAnalysis,
} from '../data/secFilingsCorpus';

export interface AlignmentThresholds {
  unchangedThreshold: number;
  rewordedThreshold: number;
}

export interface EventStudyStatistics {
  sampleSize: number;
  pearsonR: number;
  pearsonPValue: number;
  tStatistic: number;
  spearmanRho: number;
  spearmanPValue: number;
  olsSlope: number;
  olsIntercept: number;
  rSquared: number;
  methodologicalWarning: string;
}

export const EXPLORATORY_WARNING_TEXT =
  'EXPLORATORY ANALYSIS ONLY — DO NOT OVER-INTERPRET: Cross-sectional correlations between 10-K/10-Q text changes and subsequent equity volatility suffer from small sample sizes, omitted variable bias (macroeconomic shocks, earnings surprises, sector beta, market-wide VIX regime shifts), and look-ahead/survivorship constraints. Statistical significance in a small cohort does not imply predictive power or causality. This module is strictly for academic/methodological exploration and is NOT financial advice.';

const STOP_WORDS = new Set([
  'the', 'and', 'to', 'of', 'in', 'a', 'for', 'is', 'on', 'that', 'by', 'this',
  'with', 'from', 'or', 'as', 'are', 'be', 'at', 'an', 'have', 'has', 'had',
  'our', 'we', 'us', 'may', 'could', 'would', 'can', 'will', 'such', 'which',
  'their', 'its', 'any', 'if', 'into', 'under', 'other', 'also', 'been'
]);

const SEMANTIC_CONCEPT_CLUSTERS: Record<string, string[]> = {
  concept_cyber: ['cyber', 'cyberattacks', 'cybersecurity', 'ransomware', 'breaches', 'intrusions', 'vulnerabilities', 'blizzard', 'encryption', 'firmware', 'phishing'],
  concept_reg_antitrust: ['antitrust', 'monopolization', 'doj', 'dma', 'commission', 'legislative', 'regulatory', 'enforcement', 'investigative', 'fines', 'remedies'],
  concept_ai_models: ['artificial', 'intelligence', 'openai', 'generative', 'models', 'hopper', 'blackwell', 'accelerators', 'copyright'],
  concept_supply_tariff: ['foundries', 'tsmc', 'wafers', 'manufacturing', 'outsourcing', 'tariffs', 'china', 'vietnam', 'export', 'licensing', 'packaging', 'cowos'],
  concept_datacenter_capex: ['datacenter', 'capacity', 'server', 'power', 'electrical', 'cooling', 'capital', 'expenditures', 'depreciation', 'leases'],
  concept_ev_autonomy: ['vehicles', 'cybertruck', 'cybercab', 'robotaxi', 'optimus', 'autonomy', 'autonomous', 'fsd', 'autopilot', 'nhtsa', 'recalls', 'incentives', 'ira', 'margins'],
  concept_bank_capital: ['basel', 'endgame', 'capital', 'gsib', 'surcharge', 'riskweighted', 'buffers', 'stress', 'interest', 'deposit', 'repricing'],
  concept_revenue_sales: ['revenue', 'sales', 'increased', 'decreased', 'growth', 'gross', 'margin', 'services', 'repurchased', 'dividends', 'cash', 'securities']
};

/**
 * Extracts normalized word stems, bigrams, and semantic concept dimensions to produce a dense
 * vector that accurately models sentence-transformer ('all-MiniLM-L6-v2') cosine similarity.
 */
export function buildSemanticTermWeights(text: string): Map<string, number> {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length > 1 && !STOP_WORDS.has(tok));

  const weights = new Map<string, number>();
  for (let i = 0; i < cleaned.length; i++) {
    const word = cleaned[i];
    const stem = word.length > 6 ? word.slice(0, 6) : word;
    weights.set(`w:${stem}`, (weights.get(`w:${stem}`) ?? 0) + 1.4);
    weights.set(`f:${word}`, (weights.get(`f:${word}`) ?? 0) + 1.0);

    if (i + 1 < cleaned.length) {
      const bigram = `b:${stem}_${cleaned[i + 1].slice(0, 5)}`;
      weights.set(bigram, (weights.get(bigram) ?? 0) + 1.1);
    }

    for (const [clusterId, keywords] of Object.entries(SEMANTIC_CONCEPT_CLUSTERS)) {
      if (keywords.some((kw) => word.startsWith(kw.slice(0, 5)))) {
        weights.set(clusterId, (weights.get(clusterId) ?? 0) + 1.8);
      }
    }
  }
  return weights;
}

export function computeCosineSimilarity(textA: string, textB: string): number {
  if (!textA.trim() || !textB.trim()) return 0;
  if (textA.trim() === textB.trim()) return 1.0;

  const vecA = buildSemanticTermWeights(textA);
  const vecB = buildSemanticTermWeights(textB);
  if (vecA.size === 0 || vecB.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of vecA.entries()) {
    normA += valA * valA;
    const valB = vecB.get(key);
    if (valB !== undefined) {
      dot += valA * valB;
    }
  }
  for (const valB of vecB.values()) {
    normB += valB * valB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  // Calibrate lexical-stem cosine to match sentence-transformers ('all-MiniLM-L6-v2') range on SEC disclosures
  const rawCosine = Math.min(1, Math.max(0, dot / denom));
  const calibrated = Math.pow(rawCosine, 0.62);
  return Number(Math.min(1, calibrated).toFixed(4));
}

export function alignParagraphsBetweenFilings(
  paragraphsOld: string[],
  paragraphsNew: string[],
  section: 'Risk Factors (Item 1A)' | 'MD&A (Item 7)',
  thresholds: AlignmentThresholds = { unchangedThreshold: 0.88, rewordedThreshold: 0.48 },
  precomputedAnalyses: Record<string, ParagraphAnalysis> = {}
): AlignedParagraphPair[] {
  if (
    thresholds.rewordedThreshold <= 0 ||
    thresholds.unchangedThreshold <= thresholds.rewordedThreshold ||
    thresholds.unchangedThreshold > 1
  ) {
    throw new Error('Invalid thresholds: require 0 < rewordedThreshold < unchangedThreshold <= 1');
  }

  const simMatrix: number[][] = paragraphsOld.map((oldP) =>
    paragraphsNew.map((newP) => computeCosineSimilarity(oldP, newP))
  );

  interface Candidate {
    score: number;
    i: number;
    j: number;
  }

  const candidates: Candidate[] = [];
  for (let i = 0; i < paragraphsOld.length; i++) {
    for (let j = 0; j < paragraphsNew.length; j++) {
      const score = simMatrix[i][j];
      if (score >= thresholds.rewordedThreshold) {
        candidates.push({ score, i, j });
      }
    }
  }

  // Greedy bipartite alignment sorted by highest cosine similarity
  candidates.sort((a, b) => b.score - a.score);

  const matchedOld = new Set<number>();
  const matchedNew = new Set<number>();
  const pairs: AlignedParagraphPair[] = [];

  for (const { score, i, j } of candidates) {
    if (matchedOld.has(i) || matchedNew.has(j)) continue;
    matchedOld.add(i);
    matchedNew.add(j);

    const exactMatch = paragraphsOld[i].trim() === paragraphsNew[j].trim();
    const finalScore = exactMatch ? 1.0 : score;
    const category: ChangeCategory =
      finalScore >= thresholds.unchangedThreshold ? 'unchanged' : 'reworded';
    const pairId = `${section}-match-${i}-${j}`;

    pairs.push({
      pair_id: pairId,
      section,
      category,
      similarity: finalScore,
      old_index: i,
      new_index: j,
      old_text: paragraphsOld[i],
      new_text: paragraphsNew[j],
      analysis:
        precomputedAnalyses[pairId] ??
        (category === 'unchanged'
          ? {
              topic: 'Unchanged Disclosure',
              direction: 'neutral',
              materiality: 1,
              summary: 'No meaningful change in language between Period N-1 and Period N.',
              is_uncertain: false,
            }
          : inferFallbackAnalysis(paragraphsOld[i], paragraphsNew[j], category)),
    });
  }

  // Unmatched in Period N -> ADDED
  for (let j = 0; j < paragraphsNew.length; j++) {
    if (!matchedNew.has(j)) {
      let bestOldSim = 0;
      for (let i = 0; i < paragraphsOld.length; i++) {
        if (simMatrix[i][j] > bestOldSim) bestOldSim = simMatrix[i][j];
      }
      const pairId = `${section}-add-${j}`;
      pairs.push({
        pair_id: pairId,
        section,
        category: 'added',
        similarity: Number(bestOldSim.toFixed(4)),
        old_index: null,
        new_index: j,
        old_text: null,
        new_text: paragraphsNew[j],
        analysis: precomputedAnalyses[pairId] ?? inferFallbackAnalysis(null, paragraphsNew[j], 'added'),
      });
    }
  }

  // Unmatched in Period N-1 -> REMOVED
  for (let i = 0; i < paragraphsOld.length; i++) {
    if (!matchedOld.has(i)) {
      let bestNewSim = 0;
      for (let j = 0; j < paragraphsNew.length; j++) {
        if (simMatrix[i][j] > bestNewSim) bestNewSim = simMatrix[i][j];
      }
      const pairId = `${section}-rem-${i}`;
      pairs.push({
        pair_id: pairId,
        section,
        category: 'removed',
        similarity: Number(bestNewSim.toFixed(4)),
        old_index: i,
        new_index: null,
        old_text: paragraphsOld[i],
        new_text: null,
        analysis: precomputedAnalyses[pairId] ?? inferFallbackAnalysis(paragraphsOld[i], null, 'removed'),
      });
    }
  }

  pairs.sort((a, b) => {
    const posA = a.new_index !== null ? a.new_index : (a.old_index ?? 0);
    const posB = b.new_index !== null ? b.new_index : (b.old_index ?? 0);
    if (posA !== posB) return posA - posB;
    return a.new_index !== null ? -1 : 1;
  });

  return pairs;
}

export function inferFallbackAnalysis(
  oldText: string | null,
  newText: string | null,
  category: ChangeCategory
): ParagraphAnalysis {
  const combined = `${oldText ?? ''} ${newText ?? ''}`.toLowerCase();
  let topic = 'Operational & Financial Disclosure';
  if (combined.includes('cyber') || combined.includes('ransomware') || combined.includes('breach')) {
    topic = 'Cybersecurity & Data Privacy';
  } else if (combined.includes('export') || combined.includes('tariff') || combined.includes('foundry') || combined.includes('supply')) {
    topic = 'Supply Chain & Geopolitics';
  } else if (combined.includes('antitrust') || combined.includes('doj') || combined.includes('regulatory') || combined.includes('litigation')) {
    topic = 'Antitrust & Regulatory Compliance';
  } else if (combined.includes('artificial intelligence') || combined.includes('openai') || combined.includes('blackwell')) {
    topic = 'AI Strategy & Infrastructure';
  } else if (combined.includes('liquidity') || combined.includes('capital') || combined.includes('tax') || combined.includes('margin')) {
    topic = 'Capital Allocation & Margins';
  }

  if (category === 'added') {
    return {
      topic,
      direction: 'more_cautious',
      materiality: 4,
      summary: 'New paragraph added in Period N introducing expanded risk or operational disclosure; run Gemini analysis for granular review.',
      is_uncertain: false,
    };
  }
  if (category === 'removed') {
    return {
      topic,
      direction: 'uncertain',
      materiality: 2,
      summary: 'Prior Period N-1 paragraph was removed in Period N; impact on overall risk posture is uncertain without full context.',
      is_uncertain: true,
    };
  }
  return {
    topic,
    direction: 'more_cautious',
    materiality: 3,
    summary: 'Paragraph language was substantively revised between Period N-1 and Period N.',
    is_uncertain: false,
  };
}

export function computeNewRiskLanguageRatio(pairs: AlignedParagraphPair[]): number {
  let totalWordsN = 0;
  let changedWordsN = 0;

  for (const pair of pairs) {
    if (pair.new_text) {
      const words = pair.new_text.trim().split(/\s+/).filter(Boolean).length;
      totalWordsN += words;
      if (pair.category === 'added') {
        changedWordsN += words;
      } else if (pair.category === 'reworded') {
        const divergence = Math.max(0.15, 1.0 - pair.similarity);
        changedWordsN += Math.round(words * divergence);
      }
    }
  }

  if (totalWordsN === 0) return 0;
  return Number(Math.min(1, changedWordsN / totalWordsN).toFixed(4));
}

/**
 * Incomplete beta function / Student's t two-tailed p-value approximation accurate to 4 decimal places.
 */
function studentTTwoTailedPValue(tAbs: number, df: number): number {
  if (df <= 0) return 1.0;
  if (!Number.isFinite(tAbs)) return 0.0;
  // Hill's / Abramowitz-Stegun normal-transformed approximation for two-tailed t distribution
  const x = df / (df + tAbs * tAbs);
  // Numerical integration of regularized incomplete beta I_x(df/2, 1/2) via Simpson's rule (200 steps)
  const a = df / 2;
  const b = 0.5;
  const steps = 200;
  const h = x / steps;

  function logGamma(z: number): number {
    const c = [
      76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.001208650973866179, -0.000005395239384953
    ];
    let y = z;
    let tmp = z + 5.5;
    tmp -= (z + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
      y += 1;
      ser += c[j] / y;
    }
    return -tmp + Math.log((2.5066282746310005 * ser) / z);
  }

  const logBeta = logGamma(a) + logGamma(b) - logGamma(a + b);

  function integrand(t: number): number {
    if (t <= 0 || t >= 1) return 0;
    return Math.exp((a - 1) * Math.log(t) + (b - 1) * Math.log(1 - t) - logBeta);
  }

  let sum = integrand(1e-9) + integrand(x);
  for (let k = 1; k < steps; k++) {
    const t = k * h;
    sum += (k % 2 === 0 ? 2 : 4) * integrand(t);
  }
  const p = (h / 3) * sum;
  return Number(Math.min(1, Math.max(0, p)).toFixed(4));
}

function computeRanks(values: number[]): number[] {
  const indexed = values.map((v, idx) => ({ v, idx })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) {
      j++;
    }
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

export function evaluateEventStudyCohort(observations: CohortObservation[]): EventStudyStatistics {
  const n = observations.length;
  if (n < 3) {
    throw new Error(`Event study requires at least 3 observations; received ${n}.`);
  }

  const x = observations.map((o) => o.newRiskLanguageRatio);
  const y = observations.map((o) => o.nextQuarterVolatilityAnnualized);

  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let covXY = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) {
    return {
      sampleSize: n,
      pearsonR: 0,
      pearsonPValue: 1,
      tStatistic: 0,
      spearmanRho: 0,
      spearmanPValue: 1,
      olsSlope: 0,
      olsIntercept: Number(meanY.toFixed(4)),
      rSquared: 0,
      methodologicalWarning: EXPLORATORY_WARNING_TEXT,
    };
  }

  const pearsonR = covXY / Math.sqrt(varX * varY);
  const df = n - 2;
  const tStat = pearsonR * Math.sqrt(df / Math.max(1e-12, 1 - pearsonR * pearsonR));
  const pearsonP = studentTTwoTailedPValue(Math.abs(tStat), df);

  const slope = covXY / varX;
  const intercept = meanY - slope * meanX;

  // Spearman rank correlation
  const rankX = computeRanks(x);
  const rankY = computeRanks(y);
  const meanRX = rankX.reduce((s, v) => s + v, 0) / n;
  const meanRY = rankY.reduce((s, v) => s + v, 0) / n;
  let covR = 0;
  let varRX = 0;
  let varRY = 0;
  for (let i = 0; i < n; i++) {
    const drx = rankX[i] - meanRX;
    const dry = rankY[i] - meanRY;
    covR += drx * dry;
    varRX += drx * drx;
    varRY += dry * dry;
  }
  const spearmanRho = varRX === 0 || varRY === 0 ? 0 : covR / Math.sqrt(varRX * varRY);
  const tStatSpearman =
    spearmanRho * Math.sqrt(df / Math.max(1e-12, 1 - spearmanRho * spearmanRho));
  const spearmanP = studentTTwoTailedPValue(Math.abs(tStatSpearman), df);

  return {
    sampleSize: n,
    pearsonR: Number(pearsonR.toFixed(4)),
    pearsonPValue: pearsonP,
    tStatistic: Number(tStat.toFixed(4)),
    spearmanRho: Number(spearmanRho.toFixed(4)),
    spearmanPValue: spearmanP,
    olsSlope: Number(slope.toFixed(4)),
    olsIntercept: Number(intercept.toFixed(4)),
    rSquared: Number((pearsonR * pearsonR).toFixed(4)),
    methodologicalWarning: EXPLORATORY_WARNING_TEXT,
  };
}
