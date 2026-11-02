import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, FileCode2, ShieldAlert } from 'lucide-react';

interface ProjectFile {
  path: string;
  content: string;
}

export const PythonCodebaseView: React.FC = () => {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('README.md');
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/project-files')
      .then((res) => res.json())
      .then((data) => {
        if (active && Array.isArray(data.files)) {
          setFiles(data.files);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const currentFile = files.find((f) => f.path === selectedPath) ?? files[0];

  const handleCopy = async (file: ProjectFile) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedPath(file.path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleDownload = (file: ProjectFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.replace(/\//g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Methodology, Limitations & Not Financial Advice Summary */}
      <section
        aria-label="Methodology and Limitations"
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-slate-800 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">
              Methodology, Limitations &amp; Legal Disclaimer (&ldquo;Not Financial Advice&rdquo;)
            </h2>
            <p className="text-xs text-slate-700 leading-relaxed">
              <strong>Not Financial Advice:</strong> <span className="font-mono">filing-diff</span>{' '}
              is an academic and software engineering tool for comparing consecutive SEC 10-K and
              10-Q disclosures. Outputs from embedding similarity alignment, Google Gemini LLM
              summaries, materiality ratings, and the exploratory volatility event study do not
              constitute investment, legal, or financial advice.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700">
          <div className="space-y-1.5">
            <h3 className="font-bold text-slate-900">1. Ingestion &amp; Rate Limiting</h3>
            <p className="leading-relaxed">
              Downloads consecutive 10-K/10-Q HTML documents from SEC EDGAR using a mandatory{' '}
              <span className="font-mono">User-Agent</span> header and token-bucket rate limiter
              (&le; 5.0 req/s). Extracts <span className="font-mono">Item 1A</span> and{' '}
              <span className="font-mono">Item 7</span> via BeautifulSoup while filtering Table of
              Contents false positives.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-slate-900">
              2. Embedding Alignment &amp; Epistemic Humility
            </h3>
            <p className="leading-relaxed">
              Matches paragraphs between Period N-1 and Period N by greedy maximum cosine
              similarity (<span className="font-mono">sentence-transformers</span>{' '}
              <span className="font-mono">all-MiniLM-L6-v2</span>). Gemini analyzes only changed
              paragraphs using a strict Pydantic schema and sets{' '}
              <span className="font-mono">is_uncertain=True</span> whenever context is ambiguous.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-slate-900">3. Key Methodological Limitations</h3>
            <p className="leading-relaxed">
              Cross-sectional volatility correlations suffer from omitted variable bias (sector
              beta, simultaneous earnings releases, VIX regime changes) and small sample sizes.
              Preventative legal boilerplate added by counsel may inflate new risk language ratios
              without reflecting operational distress.
            </p>
          </div>
        </div>
      </section>

      {/* Complete Python 3.10+ Repository File Browser */}
      <section
        aria-label="Python 3.10+ Source Files"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-slate-700" />
              Complete Python 3.10+ Project Files (src/, configs/, tests/, requirements.txt,
              README.md)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any file below to inspect, copy, or download the full Python source code.
            </p>
          </div>
          {currentFile && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(currentFile)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedPath === currentFile.path ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy File
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownload(currentFile)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download {currentFile.path}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* File list sidebar */}
          <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 p-3 space-y-1">
            {loading ? (
              <div className="p-4 text-xs text-slate-500">Loading repository files...</div>
            ) : (
              files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono transition-colors cursor-pointer truncate ${
                    selectedPath === file.path
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-200/70'
                  }`}
                >
                  {file.path}
                </button>
              ))
            )}
          </div>

          {/* Code viewer */}
          <div className="lg:col-span-9 bg-slate-950 text-slate-100 p-5 overflow-x-auto max-h-[680px]">
            {currentFile ? (
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
                <code>{currentFile.content}</code>
              </pre>
            ) : (
              <div className="text-xs text-slate-400">Select a file to view its contents.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
