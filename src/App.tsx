/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { SEC_FILINGS_CORPUS } from './data/secFilingsCorpus';
import { alignParagraphsBetweenFilings, computeNewRiskLanguageRatio } from './utils/filingDiffEngine';
import { DiffWorkbenchView } from './components/DiffWorkbenchView';
import { EventStudyView } from './components/EventStudyView';
import { PythonCodebaseView } from './components/PythonCodebaseView';
import { Check, Copy, Download, Monitor, Terminal, X } from 'lucide-react';

type ActiveTab = 'diff' | 'event-study' | 'codebase';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('diff');
  const [selectedTicker, setSelectedTicker] = useState<string>('NVDA');
  const [showDesktopModal, setShowDesktopModal] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Desktop keyboard shortcuts: Alt+1/2/3 to switch tabs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        setActiveTab('diff');
      } else if (e.altKey && e.key === '2') {
        e.preventDefault();
        setActiveTab('event-study');
      } else if (e.altKey && e.key === '3') {
        e.preventDefault();
        setActiveTab('codebase');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  const handleCopyCommand = async (id: string, cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 2000);
    } catch {
      // Clipboard ignored
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900">
      {/* Native PC Desktop Window Titlebar */}
      <div className="bg-slate-900 text-slate-300 px-4 py-2 flex items-center justify-between border-b border-slate-800 select-none text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="w-3 h-3 rounded-full bg-rose-500/90 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-400/90 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/90 inline-block" />
          </div>
          <span className="font-mono text-slate-400 hidden sm:inline">
            FilingDiff Desktop — {selectedTicker} 10-K Workspace
          </span>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px] text-slate-400">
          <span className="hidden md:inline">Cache: .cache/edgar</span>
          <button
            type="button"
            onClick={() => setShowDesktopModal(true)}
            className="text-slate-200 hover:text-white underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Monitor className="w-3.5 h-3.5" />
            PC Desktop App (.exe / .app)
          </button>
        </div>
      </div>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200">
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
          <button
            type="button"
            onClick={() => setShowDesktopModal(true)}
            className="py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 border-transparent hover:text-slate-900"
          >
            PC Desktop Build
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportReportJson}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Diff JSON
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-6 py-7">
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
              SEC 10-K / 10-Q Semantic Diff &amp; Risk Materiality Analyzer
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-4xl">
              Compares consecutive SEC EDGAR filings by embedding cosine similarity to classify
              paragraphs as unchanged, reworded, added, or removed, ranks material changes via
              strict Pydantic / Gemini JSON schemas, and evaluates exploratory next-quarter
              volatility correlations. Not financial advice.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-500 whitespace-nowrap shrink-0">
            Shortcuts: Alt+1 Diff · Alt+2 Event Study · Alt+3 Codebase
          </div>
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

      {/* PC Desktop Build & Packaging Modal */}
      {showDesktopModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="desktop-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="desktop-modal-title"
                  className="text-lg font-bold text-slate-900 font-display flex items-center gap-2"
                >
                  <Monitor className="w-5 h-5 text-slate-800" />
                  Launch or Package as a Native PC Desktop Program
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  This repository includes both a native Python desktop window launcher (
                  <span className="font-mono">src/desktop.py</span> via{' '}
                  <span className="font-mono">pywebview</span> +{' '}
                  <span className="font-mono">PyInstaller</span>) and an Electron desktop wrapper (
                  <span className="font-mono">electron/main.cjs</span>) with the exact same
                  interface.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close PC Desktop Modal"
                onClick={() => setShowDesktopModal(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    Option 1: Native Desktop UI (Electron + Full React Workbench)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyCommand(
                        'electron',
                        'npm install && npm run dev &\nnpx electron electron/main.cjs'
                      )
                    }
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCmd === 'electron' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded font-mono text-[11px] overflow-x-auto">
                  <code>{`npm install\nnpm run dev &\nnpx electron electron/main.cjs`}</code>
                </pre>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    Option 2: Python 3.10+ Native OS Window &amp; Standalone .exe Build
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyCommand(
                        'pyinstaller',
                        'pip install -r requirements.txt\npython -m src.desktop\n# Build standalone Windows .exe / macOS .app:\npyinstaller --noconfirm --onedir --windowed --name "FilingDiff" src/desktop.py'
                      )
                    }
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCmd === 'pyinstaller' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded font-mono text-[11px] overflow-x-auto">
                  <code>{`pip install -r requirements.txt\npython -m src.desktop\n\n# Compile standalone Windows .exe / macOS .app:\npyinstaller --noconfirm --onedir --windowed --name "FilingDiff" src/desktop.py`}</code>
                </pre>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDesktopModal(false);
                  setActiveTab('codebase');
                }}
                className="px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md cursor-pointer"
              >
                Inspect src/desktop.py in Codebase
              </button>
              <button
                type="button"
                onClick={() => setShowDesktopModal(false)}
                className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Desktop Status Bar */}
      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-500">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            filing-diff Desktop · SEC EDGAR 10-K/10-Q Semantic Diff &amp; Exploratory Volatility
            Event Study
          </div>
          <div>
            For academic and engineering research only · Not financial, investment, or legal advice
          </div>
        </div>
      </footer>
    </div>
  );
}
