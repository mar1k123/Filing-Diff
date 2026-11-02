from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from pathlib import Path
from typing import Literal, Optional

import requests
from bs4 import BeautifulSoup

from src.models import FilingMetadata

logger = logging.getLogger(__name__)


class RateLimiter:
    """Token-bucket rate limiter enforcing SEC EDGAR fair access limits (<= 10 req/sec)."""

    def __init__(self, requests_per_sec: float = 5.0) -> None:
        if requests_per_sec <= 0 or requests_per_sec > 10.0:
            raise ValueError("SEC EDGAR requires rate_limit_requests_per_sec in (0, 10.0].")
        self.min_interval = 1.0 / requests_per_sec
        self._last_call = 0.0

    def wait(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_call
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_call = time.monotonic()


class EdgarIngestor:
    """Downloads SEC 10-K/10-Q filings by ticker, extracts Risk Factors & MD&A, splits paragraphs, and caches locally."""

    TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
    SUBMISSIONS_URL_TPL = "https://data.sec.gov/submissions/CIK{cik_padded}.json"
    ARCHIVE_URL_TPL = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_no_hyphens}/{primary_doc}"

    def __init__(
        self,
        user_agent: str,
        cache_dir: str | Path = ".cache/edgar",
        requests_per_sec: float = 5.0,
        timeout_sec: int = 30,
        min_paragraph_chars: int = 80,
    ) -> None:
        if not user_agent or "@" not in user_agent:
            raise ValueError(
                "SEC EDGAR fair access requires a descriptive User-Agent header with contact email, "
                "e.g. 'FilingDiffResearch/1.0 (contact@example.org)'."
            )
        self.user_agent = user_agent
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.rate_limiter = RateLimiter(requests_per_sec=requests_per_sec)
        self.timeout_sec = timeout_sec
        self.min_paragraph_chars = min_paragraph_chars
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": self.user_agent,
                "Accept-Encoding": "gzip, deflate",
            }
        )

    def _get_cached_or_fetch(self, url: str, cache_key: str) -> str:
        cache_path = self.cache_dir / cache_key
        if cache_path.exists():
            return cache_path.read_text(encoding="utf-8")

        self.rate_limiter.wait()
        host = "data.sec.gov" if "data.sec.gov" in url else "www.sec.gov"
        headers = {"User-Agent": self.user_agent, "Host": host}
        response = self.session.get(url, headers=headers, timeout=self.timeout_sec)
        response.raise_for_status()
        text = response.text
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(text, encoding="utf-8")
        return text

    def resolve_cik(self, ticker: str) -> str:
        """Resolves a stock ticker (e.g. 'AAPL') to a 10-digit zero-padded SEC CIK."""
        normalized = ticker.strip().upper()
        raw = self._get_cached_or_fetch(self.TICKERS_URL, "company_tickers.json")
        data = json.loads(raw)
        for entry in data.values():
            if entry.get("ticker", "").upper() == normalized:
                return str(entry["cik_str"]).zfill(10)
        raise KeyError(f"Ticker '{normalized}' not found in SEC company_tickers.json.")

    def list_consecutive_filings(
        self,
        ticker: str,
        form_type: Literal["10-K", "10-Q"] = "10-K",
        count: int = 2,
    ) -> list[tuple[FilingMetadata, str]]:
        """Returns the `count` most recent filings of `form_type` for `ticker` along with their document URLs."""
        cik_padded = self.resolve_cik(ticker)
        url = self.SUBMISSIONS_URL_TPL.format(cik_padded=cik_padded)
        raw = self._get_cached_or_fetch(url, f"submissions_{cik_padded}.json")
        sub = json.loads(raw)
        recent = sub.get("filings", {}).get("recent", {})

        forms = recent.get("form", [])
        filing_dates = recent.get("filingDate", [])
        accession_numbers = recent.get("accessionNumber", [])
        report_dates = recent.get("reportDate", [])
        primary_docs = recent.get("primaryDocument", [])

        results: list[tuple[FilingMetadata, str]] = []
        cik_int = int(cik_padded)
        for idx, form in enumerate(forms):
            if form == form_type:
                acc = accession_numbers[idx]
                acc_no_hyphens = acc.replace("-", "")
                pdoc = primary_docs[idx]
                doc_url = self.ARCHIVE_URL_TPL.format(
                    cik_int=cik_int,
                    accession_no_hyphens=acc_no_hyphens,
                    primary_doc=pdoc,
                )
                meta = FilingMetadata(
                    ticker=ticker.strip().upper(),
                    cik=cik_padded,
                    form_type=form_type,
                    filing_date=filing_dates[idx],
                    accession_number=acc,
                    report_period=report_dates[idx] or filing_dates[idx],
                )
                results.append((meta, doc_url))
                if len(results) >= count:
                    break

        if len(results) < count:
            raise ValueError(
                f"Found only {len(results)} filings of type {form_type} for {ticker}; needed {count}."
            )
        return results

    def download_filing_html(self, meta: FilingMetadata, doc_url: str) -> str:
        url_hash = hashlib.sha256(doc_url.encode("utf-8")).hexdigest()[:12]
        cache_name = f"{meta.ticker}_{meta.form_type}_{meta.filing_date}_{url_hash}.html"
        return self._get_cached_or_fetch(doc_url, cache_name)

    @staticmethod
    def extract_section_html_or_text(
        html_content: str,
        section: Literal["risk_factors", "mda"],
        form_type: Literal["10-K", "10-Q"] = "10-K",
    ) -> str:
        """Extracts Item 1A (Risk Factors) or Item 7 / Item 2 (MD&A) from filing HTML."""
        soup = BeautifulSoup(html_content, "html.parser")
        for tag in soup(["script", "style", "table"]):
            # Remove scripts, styles, and large numerical tables to isolate narrative language
            tag.decompose()

        full_text = soup.get_text(separator="\n")
        # Normalize non-breaking spaces and excessive blank lines
        full_text = re.sub(r"\xa0+", " ", full_text)
        full_text = re.sub(r"[ \t]+", " ", full_text)

        if section == "risk_factors":
            start_pattern = re.compile(
                r"(?:ITEM\s*1A\.?\s*[\-—–:]?\s*RISK\s+FACTORS)", re.IGNORECASE
            )
            end_pattern = re.compile(
                r"(?:ITEM\s*1B\.?\s*|ITEM\s*1C\.?\s*|ITEM\s*2\.?\s*[\-—–:]?\s*(?:PROPERTIES|UNREGISTERED))",
                re.IGNORECASE,
            )
        else:
            if form_type == "10-K":
                start_pattern = re.compile(
                    r"(?:ITEM\s*7\.?\s*[\-—–:]?\s*MANAGEMENT['’]?S\s+DISCUSSION)",
                    re.IGNORECASE,
                )
                end_pattern = re.compile(
                    r"(?:ITEM\s*7A\.?\s*|ITEM\s*8\.?\s*[\-—–:]?\s*FINANCIAL\s+STATEMENTS)",
                    re.IGNORECASE,
                )
            else:
                start_pattern = re.compile(
                    r"(?:ITEM\s*2\.?\s*[\-—–:]?\s*MANAGEMENT['’]?S\s+DISCUSSION)",
                    re.IGNORECASE,
                )
                end_pattern = re.compile(
                    r"(?:ITEM\s*3\.?\s*[\-—–:]?\s*QUANTITATIVE|ITEM\s*4\.?\s*[\-—–:]?\s*CONTROLS)",
                    re.IGNORECASE,
                )

        matches = list(start_pattern.finditer(full_text))
        if not matches:
            return full_text

        # Skip Table of Contents hit by choosing the match followed by the longest body before end_pattern
        best_slice = ""
        for m in matches:
            start_pos = m.end()
            end_match = end_pattern.search(full_text, pos=start_pos + 200)
            end_pos = end_match.start() if end_match else min(len(full_text), start_pos + 250_000)
            candidate = full_text[start_pos:end_pos].strip()
            if len(candidate) > len(best_slice):
                best_slice = candidate

        return best_slice if best_slice else full_text

    def split_into_paragraphs(self, section_text: str) -> list[str]:
        """Splits extracted section text into substantive narrative paragraphs."""
        raw_blocks = re.split(r"\n\s*\n+", section_text)
        paragraphs: list[str] = []
        boilerplate_re = re.compile(
            r"^(?:table of contents|page \d+|\d+|item 1a\.?|item 7\.?)$",
            re.IGNORECASE,
        )

        for block in raw_blocks:
            cleaned = " ".join(block.strip().split())
            if len(cleaned) < self.min_paragraph_chars:
                continue
            if boilerplate_re.match(cleaned):
                continue
            paragraphs.append(cleaned)
        return paragraphs
