import {
  alignParagraphsBetweenFilings,
  computeNewRiskLanguageRatio,
  evaluateEventStudyCohort,
} from '../src/utils/filingDiffEngine';
import { SEC_FILINGS_CORPUS, VERIFIED_EVENT_STUDY_COHORT } from '../src/data/secFilingsCorpus';

const stats = evaluateEventStudyCohort(VERIFIED_EVENT_STUDY_COHORT);
console.log('=== EVENT STUDY STATS ===');
console.log(JSON.stringify(stats, null, 2));

console.log('=== PER-COMPANY DIFF SUMMARY ===');
for (const c of SEC_FILINGS_CORPUS) {
  const pairs = alignParagraphsBetweenFilings(
    c.priorFiling.riskFactors,
    c.currentFiling.riskFactors,
    'Risk Factors (Item 1A)',
    { unchangedThreshold: 0.88, rewordedThreshold: 0.48 },
    c.precomputedAnalyses
  );
  const ratio = computeNewRiskLanguageRatio(pairs);
  console.log(
    JSON.stringify({
      ticker: c.ticker,
      priorDate: c.priorFiling.filingDate,
      currentDate: c.currentFiling.filingDate,
      totalPairs: pairs.length,
      unchanged: pairs.filter((p) => p.category === 'unchanged').length,
      reworded: pairs.filter((p) => p.category === 'reworded').length,
      added: pairs.filter((p) => p.category === 'added').length,
      removed: pairs.filter((p) => p.category === 'removed').length,
      newRiskRatio: ratio,
    })
  );
}
