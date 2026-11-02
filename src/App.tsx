/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SEC_FILINGS_CORPUS } from './data/secFilingsCorpus';
import { alignParagraphsBetweenFilings, computeNewRiskLanguageRatio } from './utils/filingDiffEngine';
import { DiffWorkbenchView } from './components/DiffWorkbenchView';
import { EventStudyView } from './components/EventStudyView';
import { PythonCodebaseView } from './components/PythonCodebaseView';

type ActiveTab = 'diff' | 'event-study' | 'codebase';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('diff');
  const [selectedTicker, setSelectedTicker] = useState<string>('NVDA');

  const handleExportReportJson = () => {
    const company =
      SEC_FILINGS_CORPUS.find((c) => c.ticker === selectedTicker) ?? SEC_FILINGS_CORPUS[0];
    const riskPairs = alignParagraphsBetweenFilings(
      company.priorFiling.riskFactors,
      company.currentFiling.riskFactors,
      'Risk Factors (Item 1A)',
      { unchangedThreshold: 0.88, rewordedThreshold: 0.48 },
      company.precomputedAnalyses
    );
    const mdaPairs = alignParagraphsBetweenFilings(
      company.priorFiling.mda,
      company.currentFiling.mda,
      'MD&A (Item 7)',
      { unchangedThreshold: 0.88, rewordedThreshold: 0.48 },
      company.precomputedAnalyses
    );
    const payload = {
      tool: 'filing-diff',
      disclaimer:
        'Exploratory analysis only. Not financial, legal, or investment advice.',
      ticker: company.ticker,
      companyName: company.companyName,
      cik: company.cik,
      priorFiling: {
        filingDate: company.priorFiling.filingDate,
        accessionNumber: company.priorFiling.accessionNumber,
      },
      currentFiling: {
        filingDate: company.currentFiling.filingDate,
        accessionNumber: company.currentFiling.accessionNumber,
      },
      newRiskLanguageRatio: computeNewRiskLanguageRatio(riskPairs),
      realizedVolatility63dAnnualized: company.realizedVolatility63dAnnualized,
      riskFactorsAligned: riskPairs,
      mdaAligned: mdaPairs,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filing-diff-${company.ticker}-${company.currentFiling.filingDate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('diff');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          filing-diff
        </a>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setActiveTab('diff')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'diff'
                ? 'text-slate-900 border-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Filing Diff Workbench
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('event-study')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'event-study'
                ? 'text-slate-900 border-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Exploratory Event Study
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('codebase')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'codebase'
                ? 'text-slate-900 border-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Methodology &amp; Python Suite
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportReportJson}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Export Diff JSON
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
            SEC 10-K / 10-Q Semantic Diff &amp; Risk Materiality Analyzer
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-4xl">
            Compares consecutive SEC EDGAR filings by embedding cosine similarity to classify
            paragraphs as unchanged, reworded, added, or removed, ranks material changes via strict
            Pydantic / Gemini JSON schemas, and evaluates exploratory next-quarter volatility
            correlations. Not financial advice.
          </p>
        </div>

        {activeTab === 'diff' && (
          <DiffWorkbenchView
            companies={SEC_FILINGS_CORPUS}
            selectedTicker={selectedTicker}
            onSelectTicker={setSelectedTicker}
            liveEdgarTriggerCount={0}
          />
        )}

        {activeTab === 'event-study' && <EventStudyView />}

        {activeTab === 'codebase' && <PythonCodebaseView />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            filing-diff · SEC EDGAR 10-K/10-Q Semantic Diff &amp; Exploratory Volatility Event
            Study
          </div>
          <div>
            For academic and engineering research only · Not financial, investment, or legal advice
          </div>
        </div>
      </footer>
    </div>
  );
}
