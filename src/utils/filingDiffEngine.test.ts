import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignParagraphsBetweenFilings,
  computeCosineSimilarity,
  computeNewRiskLanguageRatio,
  evaluateEventStudyCohort,
} from './filingDiffEngine';
import { SEC_FILINGS_CORPUS, VERIFIED_EVENT_STUDY_COHORT } from '../data/secFilingsCorpus';

test('computeCosineSimilarity returns 1.0 for identical paragraphs and <1.0 for modified paragraphs', () => {
  const p1 =
    'We depend on third-party foundries, primarily TSMC, to manufacture our semiconductor wafers.';
  const p2 =
    'We depend on third-party foundries, primarily TSMC, to manufacture our semiconductor wafers and CoWoS packaging.';
  const pUnrelated =
    'Commercial real estate office loan portfolios face elevated default risk due to remote work.';

  assert.equal(computeCosineSimilarity(p1, p1), 1.0);
  const simModified = computeCosineSimilarity(p1, p2);
  assert.ok(simModified > 0.7 && simModified < 1.0, `Expected 0.7 < ${simModified} < 1.0`);
  const simUnrelated = computeCosineSimilarity(p1, pUnrelated);
  assert.ok(simUnrelated < 0.35, `Expected unrelated similarity < 0.35, got ${simUnrelated}`);
});

test('alignParagraphsBetweenFilings classifies unchanged, reworded, added, and removed paragraphs on NVDA 10-K', () => {
  const nvda = SEC_FILINGS_CORPUS.find((c) => c.ticker === 'NVDA');
  assert.ok(nvda, 'NVDA corpus entry must exist');

  const aligned = alignParagraphsBetweenFilings(
    nvda.priorFiling.riskFactors,
    nvda.currentFiling.riskFactors,
    'Risk Factors (Item 1A)',
    { unchangedThreshold: 0.88, rewordedThreshold: 0.48 },
    nvda.precomputedAnalyses
  );

  const counts = {
    unchanged: aligned.filter((p) => p.category === 'unchanged').length,
    reworded: aligned.filter((p) => p.category === 'reworded').length,
    added: aligned.filter((p) => p.category === 'added').length,
    removed: aligned.filter((p) => p.category === 'removed').length,
  };

  assert.equal(counts.unchanged, 2);
  assert.equal(counts.reworded, 2);
  assert.equal(counts.added, 2);
  assert.equal(counts.removed, 1);

  const ratio = computeNewRiskLanguageRatio(aligned);
  assert.ok(ratio > 0.3 && ratio < 0.7, `Expected ratio in (0.3, 0.7), got ${ratio}`);
});

test('evaluateEventStudyCohort computes accurate Pearson r, Spearman rho, p-values, and OLS slope', () => {
  const stats = evaluateEventStudyCohort(VERIFIED_EVENT_STUDY_COHORT);
  assert.equal(stats.sampleSize, 12);
  assert.ok(stats.pearsonR > 0.65 && stats.pearsonR <= 1.0, `Unexpected pearsonR: ${stats.pearsonR}`);
  assert.ok(stats.pearsonPValue > 0 && stats.pearsonPValue < 0.05, `Unexpected p-value: ${stats.pearsonPValue}`);
  assert.ok(stats.spearmanRho > 0.60 && stats.spearmanRho <= 1.0);
  assert.ok(stats.olsSlope > 1.0);
  assert.ok(stats.methodologicalWarning.includes('EXPLORATORY ANALYSIS ONLY'));
});
