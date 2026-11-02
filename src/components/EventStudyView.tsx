import React, { useMemo, useState } from 'react';
import {
  CohortObservation,
  VERIFIED_EVENT_STUDY_COHORT,
} from '../data/secFilingsCorpus';
import {
  evaluateEventStudyCohort,
  EXPLORATORY_WARNING_TEXT,
} from '../utils/filingDiffEngine';
import { AlertTriangle, Plus, RotateCcw } from 'lucide-react';

export const EventStudyView: React.FC = () => {
  const [activeTickers, setActiveTickers] = useState<Set<string>>(
    new Set(VERIFIED_EVENT_STUDY_COHORT.map((o) => o.ticker))
  );
  const [customObservations, setCustomObservations] = useState<CohortObservation[]>([]);
  const [newTicker, setNewTicker] = useState<string>('');
  const [newRatioPct, setNewRatioPct] = useState<string>('24.0');
  const [newVolPct, setNewVolPct] = useState<string>('32.5');
  const [formError, setFormError] = useState<string | null>(null);

  const allObservations = useMemo(
    () => [...VERIFIED_EVENT_STUDY_COHORT, ...customObservations],
    [customObservations]
  );

  const activeCohort = useMemo(
    () => allObservations.filter((o) => activeTickers.has(o.ticker)),
    [allObservations, activeTickers]
  );

  const stats = useMemo(() => {
    if (activeCohort.length < 3) return null;
    return evaluateEventStudyCohort(activeCohort);
  }, [activeCohort]);

  const handleToggleTicker = (ticker: string) => {
    setActiveTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        if (next.size <= 3) return prev; // Keep at least 3 for valid df = N - 2
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  const handleResetCohort = () => {
    setCustomObservations([]);
    setActiveTickers(new Set(VERIFIED_EVENT_STUDY_COHORT.map((o) => o.ticker)));
    setFormError(null);
  };

  const handleAddObservation = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanedTicker = newTicker.trim().toUpperCase();
    if (!cleanedTicker || !/^[A-Z]{1,6}$/.test(cleanedTicker)) {
      setFormError('Enter a valid 1-6 letter stock ticker symbol (e.g., AMD, INTC).');
      return;
    }
    if (allObservations.some((o) => o.ticker === cleanedTicker)) {
      setFormError(`Ticker ${cleanedTicker} is already in the cohort.`);
      return;
    }
    const ratioNum = parseFloat(newRatioPct);
    const volNum = parseFloat(newVolPct);
    if (Number.isNaN(ratioNum) || ratioNum <= 0 || ratioNum >= 100) {
      setFormError('New Risk Language Ratio (%) must be between 0.1 and 99.9.');
      return;
    }
    if (Number.isNaN(volNum) || volNum <= 1 || volNum >= 250) {
      setFormError('Next-Quarter Annualized Volatility (%) must be between 1.0 and 250.0.');
      return;
    }

    const addedObs: CohortObservation = {
      ticker: cleanedTicker,
      companyName: `${cleanedTicker} Corp. (User Cohort Entry)`,
      sector: 'Custom Entry',
      filingDateCurrent: '2025-02-15',
      filingDatePrior: '2024-02-15',
      totalParagraphsCurrent: 60,
      addedParagraphs: Math.round((ratioNum / 100) * 25),
      rewordedParagraphs: Math.round((ratioNum / 100) * 35),
      removedParagraphs: 2,
      newRiskLanguageRatio: Number((ratioNum / 100).toFixed(4)),
      nextQuarterVolatilityAnnualized: Number((volNum / 100).toFixed(4)),
    };

    setCustomObservations((prev) => [...prev, addedObs]);
    setActiveTickers((prev) => new Set([...prev, cleanedTicker]));
    setNewTicker('');
  };

  // SVG chart coordinate math
  const chartWidth = 760;
  const chartHeight = 360;
  const padLeft = 64;
  const padRight = 32;
  const padTop = 28;
  const padBottom = 48;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const xMin = 0.08;
  const xMax = 0.42;
  const yMin = 0.15;
  const yMax = 0.70;

  const toSvgX = (xVal: number) =>
    padLeft + ((Math.min(xMax, Math.max(xMin, xVal)) - xMin) / (xMax - xMin)) * plotW;
  const toSvgY = (yVal: number) =>
    padTop + plotH - ((Math.min(yMax, Math.max(yMin, yVal)) - yMin) / (yMax - yMin)) * plotH;

  return (
    <div className="space-y-8">
      {/* Explicit Methodological Warning Banner */}
      <section
        aria-label="Exploratory Study Methodological Warning"
        className="bg-amber-50/90 border border-amber-300 rounded-lg p-5"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h2 className="text-sm font-bold text-amber-950">
              Exploratory Module — Explicit Warning Against Over-Interpreting Correlation Results
            </h2>
            <p className="text-xs text-amber-900 leading-relaxed">{EXPLORATORY_WARNING_TEXT}</p>
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong>Why small-sample correlations can mislead:</strong> High-growth technology and
              semiconductor companies (e.g., <span className="font-mono">NVDA</span>,{' '}
              <span className="font-mono">TSLA</span>, <span className="font-mono">AVGO</span>)
              naturally revise product and regulatory risk disclosures more frequently than mature
              financials or energy companies (<span className="font-mono">JPM</span>,{' '}
              <span className="font-mono">XOM</span>) while also trading at higher baseline equity
              beta. Try unchecking <span className="font-mono">TSLA</span> and{' '}
              <span className="font-mono">NVDA</span> below to observe how sensitive Pearson{' '}
              <span className="font-mono">r</span> and the two-tailed{' '}
              <span className="font-mono">p-value</span> are to just two observations.
            </p>
          </div>
        </div>
      </section>

      {/* Statistical Readout Strip */}
      {stats && (
        <section
          aria-label="Event Study Statistical Summary"
          className="grid grid-cols-2 md:grid-cols-6 gap-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Sample Size (N)</div>
            <div
              data-testid="stat-sample-size"
              className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums"
            >
              {stats.sampleSize}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono">
              df = {stats.sampleSize - 2}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Pearson Linear r</div>
            <div
              data-testid="stat-pearson-r"
              className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums"
            >
              {stats.pearsonR.toFixed(4)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono">
              t = {stats.tStatistic.toFixed(3)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Pearson p-value (2-tailed)</div>
            <div
              data-testid="stat-pearson-p"
              className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums"
            >
              {stats.pearsonPValue.toFixed(4)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {stats.pearsonPValue < 0.05 ? 'p < 0.05 (Unadjusted)' : 'Not significant (p >= 0.05)'}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Spearman Rank &rho;</div>
            <div className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {stats.spearmanRho.toFixed(4)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono">
              Rank p = {stats.spearmanPValue.toFixed(4)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">OLS Regression Slope</div>
            <div className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {stats.olsSlope.toFixed(3)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono">
              Intercept: {stats.olsIntercept.toFixed(3)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Variance Explained (R&sup2;)</div>
            <div className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {(stats.rSquared * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-slate-500">Uncontrolled cross-section</div>
          </div>
        </section>
      )}

      {/* Scatter Plot + Interactive Sensitivity Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Scatter Plot */}
        <section
          aria-label="New Risk Language vs Next-Quarter Volatility Scatter Plot"
          className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                New Risk Language Ratio vs. Next-Quarter Realized Volatility (63 Trading Days)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                X-axis: Fraction of Period N Item 1A words added or substantively reworded · Y-axis:
                Annualized daily log-return volatility (&sigma; = std(ln(P&#8348;/P&#8348;&#8331;&#8321;))
                &times; &radic;252)
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetCohort}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Cohort (N=12)
            </button>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto border border-slate-100 rounded bg-slate-50/50"
              role="img"
              aria-label="Scatter plot comparing New Risk Language Ratio and Next-Quarter Annualized Volatility"
            >
              {/* Grid lines */}
              {[0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4].map((xTick) => {
                const cx = toSvgX(xTick);
                return (
                  <g key={`x-${xTick}`}>
                    <line
                      x1={cx}
                      y1={padTop}
                      x2={cx}
                      y2={padTop + plotH}
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={cx}
                      y={padTop + plotH + 18}
                      textAnchor="middle"
                      className="text-[11px] fill-slate-500 font-mono"
                    >
                      {(xTick * 100).toFixed(0)}%
                    </text>
                  </g>
                );
              })}

              {[0.2, 0.3, 0.4, 0.5, 0.6].map((yTick) => {
                const cy = toSvgY(yTick);
                return (
                  <g key={`y-${yTick}`}>
                    <line
                      x1={padLeft}
                      y1={cy}
                      x2={padLeft + plotW}
                      y2={cy}
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padLeft - 10}
                      y={cy + 4}
                      textAnchor="end"
                      className="text-[11px] fill-slate-500 font-mono"
                    >
                      {(yTick * 100).toFixed(0)}%
                    </text>
                  </g>
                );
              })}

              {/* Axes */}
              <line
                x1={padLeft}
                y1={padTop + plotH}
                x2={padLeft + plotW}
                y2={padTop + plotH}
                stroke="#64748b"
                strokeWidth={1.5}
              />
              <line
                x1={padLeft}
                y1={padTop}
                x2={padLeft}
                y2={padTop + plotH}
                stroke="#64748b"
                strokeWidth={1.5}
              />

              {/* Axis Labels */}
              <text
                x={padLeft + plotW / 2}
                y={chartHeight - 8}
                textAnchor="middle"
                className="text-xs fill-slate-700 font-semibold"
              >
                New Risk Language Ratio in Item 1A (%)
              </text>
              <text
                x={18}
                y={padTop + plotH / 2}
                textAnchor="middle"
                transform={`rotate(-90, 18, ${padTop + plotH / 2})`}
                className="text-xs fill-slate-700 font-semibold"
              >
                Next-Quarter Annualized Volatility (%)
              </text>

              {/* OLS Regression Line */}
              {stats && (
                <line
                  x1={toSvgX(0.10)}
                  y1={toSvgY(stats.olsIntercept + stats.olsSlope * 0.10)}
                  x2={toSvgX(0.38)}
                  y2={toSvgY(stats.olsIntercept + stats.olsSlope * 0.38)}
                  stroke="#0f172a"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              )}

              {/* Data Points */}
              {activeCohort.map((obs) => {
                const cx = toSvgX(obs.newRiskLanguageRatio);
                const cy = toSvgY(obs.nextQuarterVolatilityAnnualized);
                const labelOffset =
                  obs.ticker === 'META'
                    ? { dx: -40, dy: 12 }
                    : obs.ticker === 'UNH'
                      ? { dx: 9, dy: -6 }
                      : obs.ticker === 'GOOGL'
                        ? { dx: 9, dy: -5 }
                        : { dx: 9, dy: 4 };
                return (
                  <g key={obs.ticker}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill="#0f172a"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <text
                      x={cx + labelOffset.dx}
                      y={cy + labelOffset.dy}
                      className="text-[11px] font-mono font-bold fill-slate-900"
                    >
                      {obs.ticker}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        {/* Cohort Sensitivity & Custom Observation Panel */}
        <section
          aria-label="Cohort Sensitivity and Outlier Controls"
          className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 space-y-5"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Outlier Sensitivity Toggle (Min 3 Tickers)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Toggle individual tickers in or out of the regression to inspect small-sample fragility
              and p-value shifts:
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {allObservations.map((obs) => {
              const checked = activeTickers.has(obs.ticker);
              return (
                <button
                  key={obs.ticker}
                  type="button"
                  onClick={() => handleToggleTicker(obs.ticker)}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    checked
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-500 border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {obs.ticker} ({checked ? 'Included' : 'Excluded'})
                </button>
              );
            })}
          </div>

          <form onSubmit={handleAddObservation} className="pt-4 border-t border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-900">
              Add Ticker Observation to Test Sensitivity
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="add-ticker-input" className="block text-[11px] text-slate-600 mb-1">
                  Ticker
                </label>
                <input
                  id="add-ticker-input"
                  type="text"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value)}
                  placeholder="AMD"
                  className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="add-ratio-input" className="block text-[11px] text-slate-600 mb-1">
                  New Risk %
                </label>
                <input
                  id="add-ratio-input"
                  type="number"
                  step="0.1"
                  value={newRatioPct}
                  onChange={(e) => setNewRatioPct(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="add-vol-input" className="block text-[11px] text-slate-600 mb-1">
                  63d Vol %
                </label>
                <input
                  id="add-vol-input"
                  type="number"
                  step="0.1"
                  value={newVolPct}
                  onChange={(e) => setNewVolPct(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
                />
              </div>
            </div>
            {formError && <p className="text-xs text-rose-700 font-medium">{formError}</p>}
            <button
              type="submit"
              className="w-full h-9 px-4 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Observation &amp; Recompute p-value
            </button>
          </form>
        </section>
      </div>

      {/* Cohort Observations Data Table */}
      <section
        aria-label="Event Study Cohort Data Table"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Cohort Observations: Consecutive 10-K Item 1A Diff vs. 63-Day Post-Filing Realized
            Volatility
          </h3>
          <span className="text-xs font-mono text-slate-600">
            Active Sample: N = {activeCohort.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Ticker</th>
                <th className="py-3 px-4">Company &amp; Sector</th>
                <th className="py-3 px-4">Prior 10-K</th>
                <th className="py-3 px-4">Current 10-K</th>
                <th className="py-3 px-4 text-right">Item 1A Paras (N)</th>
                <th className="py-3 px-4 text-right">Added / Reworded / Removed</th>
                <th className="py-3 px-4 text-right">New Risk Language Ratio</th>
                <th className="py-3 px-4 text-right">Next-Quarter Volatility (Ann.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {activeCohort.map((obs) => (
                <tr key={obs.ticker} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{obs.ticker}</td>
                  <td className="py-3 px-4 text-slate-800">
                    <span className="font-medium text-slate-900">{obs.companyName}</span> ·{' '}
                    <span className="text-slate-500">{obs.sector}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                    {obs.filingDatePrior}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                    {obs.filingDateCurrent}
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-slate-700 tabular-nums">
                    {obs.totalParagraphsCurrent}
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-slate-700 tabular-nums">
                    +{obs.addedParagraphs} / ~{obs.rewordedParagraphs} / -{obs.removedParagraphs}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-right text-slate-900 tabular-nums">
                    {(obs.newRiskLanguageRatio * 100).toFixed(2)}%
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-right text-slate-900 tabular-nums">
                    {(obs.nextQuarterVolatilityAnnualized * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
