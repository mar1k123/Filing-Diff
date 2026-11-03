import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

// Rate limiter for SEC EDGAR requests (max 5 req/sec to strictly respect 10 req/sec SEC limit)
let lastEdgarCallMs = 0;
async function enforceEdgarRateLimit(): Promise<void> {
  const now = Date.now();
  const minIntervalMs = 200; // 5 requests/sec
  const elapsed = now - lastEdgarCallMs;
  if (elapsed < minIntervalMs) {
    await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed));
  }
  lastEdgarCallMs = Date.now();
}

const KNOWN_CIKS: Record<string, string> = {
  NVDA: '0001045810',
  AAPL: '0000320193',
  MSFT: '0000789019',
  TSLA: '0001318605',
  JPM: '0000019617',
  AMZN: '0001018724',
  GOOGL: '0001652044',
  META: '0001326801',
  LLY: '0000059478',
  UNH: '0000731766',
  XOM: '0000034088',
  AVGO: '0001730168',
};

const SYSTEM_INSTRUCTION = `You are a senior SEC financial filing analyst comparing consecutive 10-K/10-Q disclosures.
Analyze the provided paragraph change (ADDED, REMOVED, or REWORDED) between Period N-1 and Period N.

Rules:
1. Return strict JSON matching the requested schema.
2. topic: A concise 2-4 word risk/operational category (e.g., 'Cybersecurity & Data Privacy', 'Supply Chain & Tariffs', 'AI & Regulatory Compliance', 'Liquidity & Debt Covenants').
3. direction:
   - 'more_cautious' if the company adds new risk warnings, expands threat scope, escalates severity, or softens positive assurances.
   - 'less_cautious' if a prior risk warning is removed or retired, or language shifts from acute threat to mitigated/resolved.
   - 'neutral' if the change updates dates, routine figures, or formatting without altering risk posture.
   - 'uncertain' if you cannot determine whether the change is more or less cautious from the excerpt alone.
4. materiality: Integer 1 to 5:
   - 1: Minor editorial or date update.
   - 2: Routine clarification of existing boilerplate risk.
   - 3: Notable update to operational, competitive, or regulatory language.
   - 4: Significant new risk factor or concrete disclosure of an adverse event/investigation.
   - 5: Critical change in liquidity, going-concern, major litigation, material weakness, or core business model threat.
5. summary: Exactly ONE plain-language sentence explaining what changed and why it matters.
6. Epistemic humility: If the excerpt is ambiguous, truncated, or lacks context, set is_uncertain: true, set direction: 'uncertain', and explicitly state in summary that the impact is uncertain rather than guessing.`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Gemini Structured LLM Paragraph Diff Analysis
  app.post('/api/gemini/analyze-paragraph', async (req, res) => {
    try {
      const { section, category, similarity, old_text, new_text } = req.body ?? {};
      if (!category || (!old_text && !new_text)) {
        res.status(400).json({ error: 'Missing required paragraph text or category.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error:
            'GEMINI_API_KEY is not configured on the server. Configure GEMINI_API_KEY in Settings > Secrets to run live Gemini analysis.',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = [
        `Section: ${section || 'Risk Factors (Item 1A)'}`,
        `Change Type: ${String(category).toUpperCase()}`,
        `Embedding Cosine Similarity: ${Number(similarity ?? 0).toFixed(4)}`,
        `Period N-1 (Prior Filing) Paragraph:\n${old_text || '[NONE — Paragraph did not exist in Period N-1]'}`,
        `Period N (Current Filing) Paragraph:\n${new_text || '[NONE — Paragraph was removed in Period N]'}`,
      ].join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: {
                type: Type.STRING,
                description: 'Concise 2-4 word risk or operational category.',
              },
              direction: {
                type: Type.STRING,
                description: 'One of: more_cautious, less_cautious, neutral, uncertain.',
              },
              materiality: {
                type: Type.INTEGER,
                description: 'Materiality rating from 1 (minor) to 5 (critical).',
              },
              summary: {
                type: Type.STRING,
                description: 'One-sentence plain-language summary. State uncertainty explicitly rather than guessing.',
              },
              is_uncertain: {
                type: Type.BOOLEAN,
                description: 'True if context is insufficient to determine direction or materiality.',
              },
            },
            required: ['topic', 'direction', 'materiality', 'summary', 'is_uncertain'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      const validDirections = ['more_cautious', 'less_cautious', 'neutral', 'uncertain'];
      const normalized = {
        topic: String(parsed.topic || 'Uncertain / Unclassified').slice(0, 80),
        direction: validDirections.includes(parsed.direction) ? parsed.direction : 'uncertain',
        materiality: Math.min(5, Math.max(1, Number(parsed.materiality) || 1)),
        summary: String(parsed.summary || 'Model could not determine impact with certainty.'),
        is_uncertain: Boolean(parsed.is_uncertain),
      };

      res.json({ analysis: normalized });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown Gemini API error';
      res.status(500).json({ error: message });
    }
  });

  // 2. Live SEC EDGAR Submissions Metadata Check (with proper User-Agent and rate limiter)
  app.get('/api/edgar/submissions/:ticker', async (req, res) => {
    try {
      const ticker = String(req.params.ticker || '')
        .trim()
        .toUpperCase();
      const userAgent =
        String(req.query.userAgent || '').trim() ||
        'FilingDiffResearch/1.0 (research@example.org)';

      if (!userAgent.includes('@')) {
        res.status(400).json({
          error:
            'SEC EDGAR Fair Access policy requires a contact email in the User-Agent header (e.g., FilingDiffResearch/1.0 (research@example.org)).',
        });
        return;
      }

      const cik = KNOWN_CIKS[ticker];
      if (!cik) {
        res.status(404).json({
          error: `Ticker ${ticker} is not in the quick-lookup CIK table. Supported live EDGAR check tickers: ${Object.keys(KNOWN_CIKS).join(', ')}.`,
        });
        return;
      }

      await enforceEdgarRateLimit();
      const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        res.status(response.status).json({
          error: `SEC EDGAR returned HTTP ${response.status} for CIK ${cik}.`,
        });
        return;
      }

      const data = (await response.json()) as {
        name?: string;
        cik?: string;
        filings?: {
          recent?: {
            form?: string[];
            filingDate?: string[];
            accessionNumber?: string[];
            reportDate?: string[];
          };
        };
      };

      const recent = data.filings?.recent;
      const forms = recent?.form ?? [];
      const dates = recent?.filingDate ?? [];
      const accessions = recent?.accessionNumber ?? [];
      const reportDates = recent?.reportDate ?? [];

      const recent10K10Q: Array<{
        form: string;
        filingDate: string;
        accessionNumber: string;
        reportDate: string;
      }> = [];

      for (let i = 0; i < forms.length && recent10K10Q.length < 6; i++) {
        if (forms[i] === '10-K' || forms[i] === '10-Q') {
          recent10K10Q.push({
            form: forms[i],
            filingDate: dates[i] ?? '',
            accessionNumber: accessions[i] ?? '',
            reportDate: reportDates[i] ?? '',
          });
        }
      }

      res.json({
        ticker,
        cik,
        entityName: data.name ?? ticker,
        userAgentUsed: userAgent,
        recentFilings: recent10K10Q,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reach data.sec.gov';
      res.status(502).json({ error: message });
    }
  });

  // 3. Serve Python 3.10+ & Desktop Project Files from Disk
  app.get('/api/project-files', async (_req, res) => {
    const filePaths = [
      'README.md',
      'requirements.txt',
      'configs/config.yaml',
      'src/__init__.py',
      'src/models.py',
      'src/ingestion.py',
      'src/alignment.py',
      'src/llm_analysis.py',
      'src/event_study.py',
      'src/app.py',
      'src/desktop.py',
      'electron/main.cjs',
      'tests/test_filing_diff.py',
    ];
    try {
      const files = await Promise.all(
        filePaths.map(async (relPath) => {
          const fullPath = path.join(__dirname, relPath);
          const content = await fs.readFile(fullPath, 'utf-8');
          return { path: relPath, content };
        })
      );
      res.json({ files });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error reading project files';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`filing-diff server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
