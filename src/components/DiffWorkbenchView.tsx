import React, { useMemo, useState } from 'react';
import {
  AlignedParagraphPair,
  ChangeCategory,
  CompanyFilingPair,
  ParagraphAnalysis,
} from '../data/secFilingsCorpus';
import {
  alignParagraphsBetweenFilings,
  computeNewRiskLanguageRatio,
} from '../utils/filingDiffEngine';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Filter,
  Loader2,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

interface DiffWorkbenchViewProps {
  companies: CompanyFilingPair[];
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
  liveEdgarTriggerCount: number;
}

interface LiveEdgarResponse {
  ticker: string;
  cik: string;
  entityName: string;
  userAgentUsed: string;
  recentFilings: Array<{
    form: string;
    filingDate: string;
    accessionNumber: string;
    reportDate: string;
  }>;
}

const CATEGORY_STYLES: Record<
  ChangeCategory,
  {
    surface: string;
    border: string;
    label: string;
    textAccent: string;
  }
> = {
  added: {
    surface: 'bg-emerald-50/75',
    border: 'border-emerald-200',
    label: 'Added in Period N',
    textAccent: 'text-emerald-900',
  },
  removed: {
    surface: 'bg-rose-50/75',
    border: 'border-rose-200',
    label: 'Removed from Period N-1',
    textAccent: 'text-rose-900',
  },
  reworded: {
    surface: 'bg-amber-50/75',
    border: 'border-amber-200',
    label: 'Reworded Disclosure',
    textAccent: 'text-amber-900',
  },
  unchanged: {
    surface: 'bg-white',
    border: 'border-slate-200',
    label: 'Unchanged',
    textAccent: 'text-slate-600',
  },
};

const DIRECTION_LABELS: Record<string, string> = {
  more_cautious: 'More Cautious (+Risk)',
  less_cautious: 'Less Cautious (-Risk)',
  neutral: 'Neutral Posture',
  uncertain: 'Uncertain (Refused to Guess)',
};

export const DiffWorkbenchView: React.FC<DiffWorkbenchViewProps> = ({
  companies,
  selectedTicker,
  onSelectTicker,
}) => {
  const [selectedSection, setSelectedSection] = useState<
    'Risk Factors (Item 1A)' | 'MD&A (Item 7)'
  >('Risk Factors (Item 1A)');
  const [unchangedThreshold, setUnchangedThreshold] = useState<number>(0.88);
  const [rewordedThreshold, setRewordedThreshold] = useState<number>(0.48);
  const [selectedTopic, setSelectedTopic] = useState<string>('ALL');
  const [selectedCategories, setSelectedCategories] = useState<Set<ChangeCategory>>(
    new Set(['added', 'reworded', 'removed', 'unchanged'])
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Custom live Gemini overrides per pair_id
  const [liveAnalyses, setLiveAnalyses] = useState<Record<string, ParagraphAnalysis>>({});
  const [analyzingPairId, setAnalyzingPairId] = useState<string | null>(null);
  const [geminiStatusMsg, setGeminiStatusMsg] = useState<string | null>(null);

  // Live EDGAR check state
  const [userAgentInput, setUserAgentInput] = useState<string>(
    'FilingDiffResearch/1.0 (research@example.org)'
  );
  const [edgarLoading, setEdgarLoading] = useState<boolean>(false);
  const [edgarResult, setEdgarResult] = useState<LiveEdgarResponse | null>(null);
  const [edgarError, setEdgarError] = useState<string | null>(null);

  const company = useMemo(
    () => companies.find((c) => c.ticker === selectedTicker) ?? companies[0],
    [companies, selectedTicker]
  );

  const alignedPairs = useMemo(() => {
    const oldParas =
      selectedSection === 'Risk Factors (Item 1A)'
        ? company.priorFiling.riskFactors
        : company.priorFiling.mda;
    const newParas =
      selectedSection === 'Risk Factors (Item 1A)'
        ? company.currentFiling.riskFactors
        : company.currentFiling.mda;

    const mergedAnalyses = {
      ...company.precomputedAnalyses,
      ...liveAnalyses,
    };

    return alignParagraphsBetweenFilings(
      oldParas,
      newParas,
      selectedSection,
      {
        unchangedThreshold,
        rewordedThreshold: Math.min(rewordedThreshold, unchangedThreshold - 0.05),
      },
      mergedAnalyses
    );
  }, [
    company,
    selectedSection,
    unchangedThreshold,
    rewordedThreshold,
    liveAnalyses,
  ]);

  const newRiskRatio = useMemo(
    () => computeNewRiskLanguageRatio(alignedPairs),
    [alignedPairs]
  );

  const categoryCounts = useMemo(() => {
    return {
      total: alignedPairs.length,
      added: alignedPairs.filter((p) => p.category === 'added').length,
      reworded: alignedPairs.filter((p) => p.category === 'reworded').length,
      removed: alignedPairs.filter((p) => p.category === 'removed').length,
      unchanged: alignedPairs.filter((p) => p.category === 'unchanged').length,
    };
  }, [alignedPairs]);

  const allTopics = useMemo(() => {
    const set = new Set<string>();
    for (const pair of alignedPairs) {
      if (pair.analysis?.topic && pair.category !== 'unchanged') {
        set.add(pair.analysis.topic);
      }
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [alignedPairs]);

  const filteredPairs = useMemo(() => {
    return alignedPairs.filter((pair) => {
      if (!selectedCategories.has(pair.category)) return false;
      if (selectedTopic !== 'ALL' && pair.analysis?.topic !== selectedTopic) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inOld = pair.old_text?.toLowerCase().includes(q) ?? false;
        const inNew = pair.new_text?.toLowerCase().includes(q) ?? false;
        const inSummary = pair.analysis?.summary.toLowerCase().includes(q) ?? false;
        const inTopic = pair.analysis?.topic.toLowerCase().includes(q) ?? false;
        if (!inOld && !inNew && !inSummary && !inTopic) return false;
      }
      return true;
    });
  }, [alignedPairs, selectedCategories, selectedTopic, searchQuery]);

  const rankedMaterialChanges = useMemo(() => {
    return filteredPairs
      .filter((p) => p.category !== 'unchanged' && p.analysis)
      .slice()
      .sort((a, b) => {
        const matA = a.analysis?.materiality ?? 0;
        const matB = b.analysis?.materiality ?? 0;
        if (matB !== matA) return matB - matA;
        return a.similarity - b.similarity;
      });
  }, [filteredPairs]);

  const toggleCategory = (cat: ChangeCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const handleRunLiveGemini = async (pair: AlignedParagraphPair) => {
    setAnalyzingPairId(pair.pair_id);
    setGeminiStatusMsg(null);
    try {
      const response = await fetch('/api/gemini/analyze-paragraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: pair.section,
          category: pair.category,
          similarity: pair.similarity,
          old_text: pair.old_text,
          new_text: pair.new_text,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setGeminiStatusMsg(
          `Gemini API notice (${pair.pair_id}): ${data.error || 'Using cached structured Pydantic analysis.'}`
        );
      } else if (data.analysis) {
        setLiveAnalyses((prev) => ({
          ...prev,
          [pair.pair_id]: data.analysis,
        }));
        setGeminiStatusMsg(
          `Updated ${pair.pair_id} via live Gemini 3.8 Flash structured JSON analysis.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setGeminiStatusMsg(`Gemini request failed: ${msg}`);
    } finally {
      setAnalyzingPairId(null);
    }
  };

  const handleCheckLiveEdgar = async () => {
    setEdgarLoading(true);
    setEdgarError(null);
    setEdgarResult(null);
    try {
      const params = new URLSearchParams({ userAgent: userAgentInput });
      const res = await fetch(
        `/api/edgar/submissions/${encodeURIComponent(company.ticker)}?${params.toString()}`
      );
      const data = await res.json();
      if (!res.ok) {
        setEdgarError(data.error || 'SEC EDGAR lookup failed.');
      } else {
        setEdgarResult(data);
      }
    } catch (err: unknown) {
      setEdgarError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setEdgarLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Control Deck: Ticker, Section, EDGAR User-Agent & Thresholds */}
      <section
        aria-label="Filing Ingestion and Alignment Controls"
        className="bg-white border border-slate-200 rounded-lg p-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          {/* Ticker Selector */}
          <div className="lg:col-span-3">
            <label
              htmlFor="ticker-select"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Company Ticker (SEC 10-K Corpus)
            </label>
            <select
              id="ticker-select"
              value={selectedTicker}
              onChange={(e) => {
                onSelectTicker(e.target.value);
                setSelectedTopic('ALL');
                setEdgarResult(null);
                setEdgarError(null);
              }}
              className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {companies.map((c) => (
                <option key={c.ticker} value={c.ticker}>
                  {c.ticker} — {c.companyName} (CIK {c.cik})
                </option>
              ))}
            </select>
          </div>

          {/* Filing Section Selector */}
          <div className="lg:col-span-3">
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              Filing Section
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md h-10">
              {(['Risk Factors (Item 1A)', 'MD&A (Item 7)'] as const).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setSelectedSection(sec);
                    setSelectedTopic('ALL');
                  }}
                  className={`text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 px-2 ${
                    selectedSection === sec
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sec === 'Risk Factors (Item 1A)' ? 'Item 1A: Risk Factors' : 'Item 7: MD&A'}
                </button>
              ))}
            </div>
          </div>

          {/* Alignment Cosine Thresholds */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between text-xs text-slate-700 mb-1.5">
              <label htmlFor="unchanged-slider" className="font-semibold flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                Unchanged Sim Threshold
              </label>
              <span className="font-mono font-semibold text-slate-900">
                {unchangedThreshold.toFixed(2)}
              </span>
            </div>
            <input
              id="unchanged-slider"
              type="range"
              min={0.75}
              max={0.96}
              step={0.01}
              value={unchangedThreshold}
              onChange={(e) => setUnchangedThreshold(parseFloat(e.target.value))}
              className="w-full accent-slate-900 cursor-pointer"
            />
          </div>

          <div className="lg:col-span-3">
            <div className="flex items-center justify-between text-xs text-slate-700 mb-1.5">
              <label htmlFor="reworded-slider" className="font-semibold">
                Reworded Sim Threshold
              </label>
              <span className="font-mono font-semibold text-slate-900">
                {rewordedThreshold.toFixed(2)}
              </span>
            </div>
            <input
              id="reworded-slider"
              type="range"
              min={0.35}
              max={0.72}
              step={0.01}
              value={rewordedThreshold}
              onChange={(e) => setRewordedThreshold(parseFloat(e.target.value))}
              className="w-full accent-slate-900 cursor-pointer"
            />
          </div>
        </div>

        {/* SEC Fair Access User-Agent & Live Submissions Verification Bar */}
        <div className="mt-5 pt-5 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{company.companyName}</span>
            <span aria-hidden="true">·</span>
            <span>Form {company.currentFiling.formType}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              Prior: {company.priorFiling.filingDate} ({company.priorFiling.accessionNumber})
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              Current: {company.currentFiling.filingDate} ({company.currentFiling.accessionNumber})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="sec-ua-input" className="sr-only">
              SEC EDGAR User-Agent Header
            </label>
            <input
              id="sec-ua-input"
              type="text"
              value={userAgentInput}
              onChange={(e) => setUserAgentInput(e.target.value)}
              placeholder="User-Agent (e.g. App/1.0 (email@org.com))"
              className="h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-800 w-64 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="button"
              onClick={handleCheckLiveEdgar}
              disabled={edgarLoading}
              className="h-9 px-3.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              {edgarLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              Query Live SEC EDGAR
            </button>
          </div>
        </div>

        {/* Live EDGAR API Result Panel */}
        {edgarError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-900">
            <strong>SEC EDGAR Request Notice:</strong> {edgarError}
          </div>
        )}
        {edgarResult && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-slate-900">
                Live SEC EDGAR Submissions Verified: {edgarResult.entityName} (CIK{' '}
                <span className="font-mono">{edgarResult.cik}</span>)
              </div>
              <div className="font-mono text-slate-600">
                User-Agent: {edgarResult.userAgentUsed} · Rate Limit: &le; 5.0 req/sec
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
              {edgarResult.recentFilings.map((f) => (
                <div
                  key={f.accessionNumber}
                  className="p-2 bg-white border border-slate-200 rounded text-slate-700 font-mono"
                >
                  <div className="font-semibold text-slate-900">
                    {f.form} · {f.filingDate}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{f.accessionNumber}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 5-Column KPI Summary Strip */}
      <section
        aria-label="Alignment Summary Metrics"
        className="grid grid-cols-2 md:grid-cols-5 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Aligned Paragraph Pairs</div>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {categoryCounts.total}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {selectedSection === 'Risk Factors (Item 1A)' ? 'Item 1A' : 'Item 7'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Added in Period N</div>
          <div className="mt-1 text-2xl font-bold font-mono text-emerald-700 tabular-nums">
            +{categoryCounts.added}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Cosine &lt; {rewordedThreshold.toFixed(2)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Reworded Disclosures</div>
          <div className="mt-1 text-2xl font-bold font-mono text-amber-700 tabular-nums">
            {categoryCounts.reworded}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Cosine [{rewordedThreshold.toFixed(2)}, {unchangedThreshold.toFixed(2)})
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Removed from N-1</div>
          <div className="mt-1 text-2xl font-bold font-mono text-rose-700 tabular-nums">
            -{categoryCounts.removed}
          </div>
          <div className="mt-1 text-xs text-slate-500">Retired or consolidated</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">New Risk Language Ratio</div>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {(newRiskRatio * 100).toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            63d Post-Filing Vol: {(company.realizedVolatility63dAnnualized * 100).toFixed(1)}%
          </div>
        </div>
      </section>

      {/* Topic & Category Interactive Filter Bar */}
      <section
        aria-label="Filter Disclosures by Topic and Category"
        className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mr-1">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              Change Category:
            </span>
            {(['added', 'reworded', 'removed', 'unchanged'] as ChangeCategory[]).map((cat) => {
              const active = selectedCategories.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)} ({categoryCounts[cat]})
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search paragraph text or topic"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search risk text, topic, summary..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Topic Filter Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap pt-3 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-700 mr-1">Filter by Topic:</span>
          {allTopics.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setSelectedTopic(topic)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedTopic === topic
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {topic === 'ALL' ? 'All Topics' : topic}
            </button>
          ))}
        </div>
      </section>

      {geminiStatusMsg && (
        <div className="p-3.5 bg-slate-900 text-white rounded-lg text-xs flex items-center justify-between">
          <span>{geminiStatusMsg}</span>
          <button
            type="button"
            onClick={() => setGeminiStatusMsg(null)}
            className="text-slate-300 hover:text-white underline ml-4 whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Ranked List of Most Material Changes */}
      <section
        aria-label="Ranked List of Most Material Changes"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Ranked List of Most Material Changes (Pydantic Structured LLM Schema)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sorted by Materiality Score (5 &rarr; 1) and Semantic Divergence (1 &minus; Cosine
              Similarity). Ambiguous excerpts are flagged as Uncertain rather than guessed.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-600 whitespace-nowrap shrink-0">
            Showing {rankedMaterialChanges.length} material shift(s)
          </div>
        </div>

        {rankedMaterialChanges.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No added, removed, or reworded paragraphs match the current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4 w-16">Rank</th>
                  <th className="py-3 px-4 w-28">Materiality</th>
                  <th className="py-3 px-4 w-48">Topic</th>
                  <th className="py-3 px-4 w-44">Direction</th>
                  <th className="py-3 px-4 w-32">Change &amp; Sim</th>
                  <th className="py-3 px-4">One-Sentence Plain-Language Summary</th>
                  <th className="py-3 px-4 w-36 text-right">Live LLM Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {rankedMaterialChanges.map((pair, idx) => {
                  const analysis = pair.analysis!;
                  return (
                    <tr key={pair.pair_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 tabular-nums">
                        #{idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums">
                        <span
                          className={
                            analysis.materiality >= 5
                              ? 'text-rose-700'
                              : analysis.materiality === 4
                                ? 'text-amber-700'
                                : 'text-slate-800'
                          }
                        >
                          {analysis.materiality} / 5
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {analysis.topic}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        {DIRECTION_LABELS[analysis.direction] ?? analysis.direction}
                        {analysis.is_uncertain && (
                          <div className="text-[11px] text-amber-800 font-medium flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Epistemic humility triggered
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 tabular-nums">
                        <span className="uppercase font-semibold">{pair.category}</span> ·{' '}
                        {pair.similarity.toFixed(3)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 leading-relaxed">
                        {analysis.summary}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleRunLiveGemini(pair)}
                          disabled={analyzingPairId === pair.pair_id}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {analyzingPairId === pair.pair_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Cpu className="w-3 h-3" />
                          )}
                          Re-Analyze (Gemini)
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Side-by-Side Paragraph Alignment Diff */}
      <section aria-label="Side-by-Side Paragraph Diff" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-slate-600" />
              Side-by-Side Paragraph Diff ({company.priorFiling.filingDate} vs.{' '}
              {company.currentFiling.filingDate})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Color-coded semantic alignment: Added (emerald), Reworded (amber), Removed (rose),
              Unchanged (neutral white).
            </p>
          </div>
          <div className="text-xs font-mono text-slate-600">
            {filteredPairs.length} of {alignedPairs.length} aligned pairs displayed
          </div>
        </div>

        <div className="space-y-4">
          {filteredPairs.map((pair) => {
            const style = CATEGORY_STYLES[pair.category];
            const analysis = pair.analysis;
            return (
              <article
                key={pair.pair_id}
                className={`border ${style.border} ${style.surface} rounded-lg overflow-hidden`}
              >
                {/* Clean unboxed metadata header following Zero-Pill Discipline */}
                <div className="px-5 py-3 border-b border-slate-200/80 bg-white/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-bold ${style.textAccent}`}>{style.label}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      Cosine Sim: {pair.similarity.toFixed(4)}
                    </span>
                    {analysis && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-900">
                          Topic: {analysis.topic}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-semibold text-slate-800 tabular-nums">
                          Materiality: {analysis.materiality}/5
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700">
                          Direction: {DIRECTION_LABELS[analysis.direction] ?? analysis.direction}
                        </span>
                      </>
                    )}
                  </div>

                  {pair.category !== 'unchanged' && (
                    <button
                      type="button"
                      onClick={() => handleRunLiveGemini(pair)}
                      disabled={analyzingPairId === pair.pair_id}
                      className="text-xs font-medium text-slate-700 hover:text-slate-900 underline flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {analyzingPairId === pair.pair_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-slate-500" />
                      )}
                      Verify with Gemini API
                    </button>
                  )}
                </div>

                {/* Plain-language LLM summary bar */}
                {analysis && pair.category !== 'unchanged' && (
                  <div className="px-5 py-2.5 bg-white/85 border-b border-slate-200/70 text-xs text-slate-800 flex items-start justify-between gap-4">
                    <div>
                      <span className="font-semibold text-slate-900">LLM Summary: </span>
                      {analysis.summary}
                    </div>
                    {analysis.is_uncertain && (
                      <span className="font-mono text-[11px] text-amber-800 shrink-0">
                        [is_uncertain=true]
                      </span>
                    )}
                  </div>
                )}

                {/* Two-column Side-by-Side Text Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
                  <div className="p-5">
                    <div className="text-[11px] font-mono text-slate-500 mb-2">
                      Period N-1 ({company.priorFiling.filingDate}) · Paragraph{' '}
                      {pair.old_index !== null ? `#${pair.old_index + 1}` : '—'}
                    </div>
                    {pair.old_text ? (
                      <p className="text-sm text-slate-800 leading-relaxed">{pair.old_text}</p>
                    ) : (
                      <p className="text-sm italic text-slate-400">
                        [No matching paragraph in Period N-1 — Newly added in Period N]
                      </p>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="text-[11px] font-mono text-slate-500 mb-2">
                      Period N ({company.currentFiling.filingDate}) · Paragraph{' '}
                      {pair.new_index !== null ? `#${pair.new_index + 1}` : '—'}
                    </div>
                    {pair.new_text ? (
                      <p className="text-sm text-slate-900 leading-relaxed font-medium">
                        {pair.new_text}
                      </p>
                    ) : (
                      <p className="text-sm italic text-slate-400">
                        [Paragraph removed or consolidated in Period N]
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
