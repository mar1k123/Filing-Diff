from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import pandas as pd
import streamlit as st
import yaml

from src.alignment import ParagraphAligner
from src.event_study import (
    EXPLORATORY_WARNING,
    evaluate_event_study,
    fetch_next_quarter_volatility,
)
from src.ingestion import EdgarIngestor
from src.llm_analysis import GeminiDiffAnalyzer
from src.models import AlignedParagraphPair, ChangeCategory, EventStudyObservation


DESKTOP_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&family=Public+Sans:wght@400;500;600&display=swap');

html, body, [class*="css"] {
    font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #0f172a;
}
h1, h2, h3, h4 {
    font-family: 'Plus Jakarta Sans', sans-serif !important;
    letter-spacing: -0.02em;
}
code, pre, [data-testid="stMetricValue"] {
    font-family: 'JetBrains Mono', monospace !important;
    font-variant-numeric: tabular-nums;
}
[data-testid="stMetric"] {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 16px;
}
</style>
"""


def load_config(config_path: str = "configs/config.yaml") -> dict:
    path = Path(config_path)
    if not path.exists():
        return {
            "edgar": {
                "user_agent": "FilingDiffResearch/1.0 (research@example.org)",
                "rate_limit_requests_per_sec": 5.0,
                "cache_dir": ".cache/edgar",
                "request_timeout_sec": 30,
            },
            "alignment": {
                "embedding_model": "all-MiniLM-L6-v2",
                "unchanged_threshold": 0.88,
                "reworded_threshold": 0.55,
                "min_paragraph_chars": 80,
            },
            "llm": {"model_name": "gemini-2.5-flash", "max_paragraphs_per_run": 25},
            "event_study": {
                "default_tickers": ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM"],
                "trading_days_post_filing": 63,
                "annualization_factor": 252,
            },
        }
    return yaml.safe_load(path.read_text(encoding="utf-8"))


COLOR_MAP = {
    ChangeCategory.ADDED: ("#ecfdf5", "#a7f3d0", "#065f46", "Added in Period N"),
    ChangeCategory.REMOVED: ("#fff1f2", "#fecdd3", "#9f1239", "Removed from Period N-1"),
    ChangeCategory.REWORDED: ("#fffbeb", "#fde68a", "#92400e", "Reworded Disclosure"),
    ChangeCategory.UNCHANGED: ("#ffffff", "#e2e8f0", "#475569", "Unchanged"),
}


def render_side_by_side_row(pair: AlignedParagraphPair) -> None:
    bg_color, border_color, text_color, badge_label = COLOR_MAP[pair.category]
    topic_str = pair.analysis.topic if pair.analysis else "Unanalyzed"
    mat_str = f"Materiality: {pair.analysis.materiality}/5" if pair.analysis else ""
    dir_str = f"Direction: {pair.analysis.direction.value}" if pair.analysis else ""
    old_idx_str = f"#{pair.old_index + 1}" if pair.old_index is not None else "—"
    new_idx_str = f"#{pair.new_index + 1}" if pair.new_index is not None else "—"

    summary_html = (
        f'<div style="padding:10px 16px; background:rgba(255,255,255,0.88); border-bottom:1px solid {border_color}; font-size:13px; color:#1e293b;">'
        f'<strong>LLM Summary:</strong> {pair.analysis.summary}</div>'
        if pair.analysis and pair.category != ChangeCategory.UNCHANGED
        else ""
    )

    st.markdown(
        f"""
        <div style="border:1px solid {border_color}; border-radius:8px; margin-bottom:16px; background:{bg_color}; overflow:hidden;">
            <div style="padding:10px 16px; background:rgba(255,255,255,0.65); border-bottom:1px solid {border_color}; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                <span style="color:{text_color}; font-weight:700;">
                    {badge_label} · <span style="font-family:'JetBrains Mono',monospace; font-weight:500; color:#334155;">Cosine Sim: {pair.similarity:.4f}</span>
                    · <span style="color:#0f172a;">Topic: {topic_str}</span>
                </span>
                <span style="font-family:'JetBrains Mono',monospace; color:#1e293b; font-weight:600;">
                    {mat_str} {f'· {dir_str}' if dir_str else ''}
                </span>
            </div>
            {summary_html}
            <div style="display:grid; grid-template-columns:1fr 1fr;">
                <div style="padding:16px; border-right:1px solid {border_color}; font-size:13.5px; line-height:1.6; color:#1e293b;">
                    <div style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#64748b; margin-bottom:6px;">Period N-1 · Paragraph {old_idx_str}</div>
                    {pair.old_text or '<em style="color:#94a3b8;">[No matching paragraph in Period N-1 — Newly added in Period N]</em>'}
                </div>
                <div style="padding:16px; font-size:13.5px; line-height:1.6; color:#0f172a; font-weight:500;">
                    <div style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#64748b; margin-bottom:6px;">Period N · Paragraph {new_idx_str}</div>
                    {pair.new_text or '<em style="color:#94a3b8;">[Paragraph removed or consolidated in Period N]</em>'}
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def main() -> None:
    st.set_page_config(page_title="filing-diff | SEC 10-K/10-Q Analyzer", layout="wide")
    st.markdown(DESKTOP_CSS, unsafe_allow_html=True)
    cfg = load_config()

    st.title("filing-diff — SEC 10-K / 10-Q Semantic Diff & Risk Materiality Analyzer")
    st.caption(
        "Compares consecutive SEC EDGAR filings by embedding cosine similarity, ranks material changes via strict "
        "Pydantic / Gemini JSON schemas, and evaluates exploratory next-quarter volatility correlations. Not financial advice."
    )

    with st.sidebar:
        st.header("Ingestion & Alignment")
        user_agent = st.text_input(
            "SEC EDGAR User-Agent",
            value=os.environ.get("SEC_USER_AGENT", cfg["edgar"]["user_agent"]),
        )
        ticker = st.text_input("Ticker Symbol", value="NVDA").strip().upper()
        form_type: Literal["10-K", "10-Q"] = st.selectbox("Form Type", ["10-K", "10-Q"])  # type: ignore[assignment]
        section_choice = st.selectbox(
            "Filing Section",
            options=[("risk_factors", "Item 1A — Risk Factors"), ("mda", "Item 7 / Item 2 — MD&A")],
            format_func=lambda x: x[1],
        )[0]
        unchanged_thresh = st.slider(
            "Unchanged Sim Threshold", 0.75, 0.98, float(cfg["alignment"]["unchanged_threshold"]), 0.01
        )
        reworded_thresh = st.slider(
            "Reworded Sim Threshold", 0.35, 0.74, float(cfg["alignment"]["reworded_threshold"]), 0.01
        )
        run_llm = st.checkbox("Run Gemini Structured Analysis (requires GEMINI_API_KEY)", value=True)
        run_btn = st.button("Compare Consecutive Filings", type="primary", use_container_width=True)

    tab_diff, tab_event = st.tabs(["Filing Diff Workbench", "Exploratory Event Study"])

    with tab_diff:
        if run_btn:
            with st.spinner(f"Fetching consecutive {form_type} filings for {ticker} from SEC EDGAR..."):
                ingestor = EdgarIngestor(
                    user_agent=user_agent,
                    cache_dir=cfg["edgar"]["cache_dir"],
                    requests_per_sec=float(cfg["edgar"]["rate_limit_requests_per_sec"]),
                    min_paragraph_chars=int(cfg["alignment"]["min_paragraph_chars"]),
                )
                filings = ingestor.list_consecutive_filings(ticker, form_type=form_type, count=2)
                (meta_curr, url_curr), (meta_prev, url_prev) = filings[0], filings[1]

                html_curr = ingestor.download_filing_html(meta_curr, url_curr)
                html_prev = ingestor.download_filing_html(meta_prev, url_prev)

                sec_curr = ingestor.extract_section_html_or_text(
                    html_curr, section=section_choice, form_type=form_type  # type: ignore[arg-type]
                )
                sec_prev = ingestor.extract_section_html_or_text(
                    html_prev, section=section_choice, form_type=form_type  # type: ignore[arg-type]
                )

                paras_curr = ingestor.split_into_paragraphs(sec_curr)
                paras_prev = ingestor.split_into_paragraphs(sec_prev)

                aligner = ParagraphAligner(
                    model_name=cfg["alignment"]["embedding_model"],
                    unchanged_threshold=unchanged_thresh,
                    reworded_threshold=reworded_thresh,
                )
                pairs = aligner.align_paragraphs(paras_prev, paras_curr, section=section_choice)

                if run_llm and os.environ.get("GEMINI_API_KEY"):
                    analyzer = GeminiDiffAnalyzer(model_name=cfg["llm"]["model_name"])
                    pairs = analyzer.analyze_material_changes(
                        pairs, max_paragraphs=int(cfg["llm"]["max_paragraphs_per_run"])
                    )

                st.session_state["pairs"] = pairs
                st.session_state["meta_curr"] = meta_curr
                st.session_state["meta_prev"] = meta_prev
                st.session_state["new_risk_ratio"] = aligner.compute_new_risk_language_ratio(pairs)

        if "pairs" in st.session_state:
            pairs: list[AlignedParagraphPair] = st.session_state["pairs"]
            meta_curr = st.session_state["meta_curr"]
            meta_prev = st.session_state["meta_prev"]
            new_risk_ratio = st.session_state["new_risk_ratio"]

            st.subheader(
                f"{meta_curr.ticker} {meta_curr.form_type}: {meta_prev.filing_date} (N-1) vs. {meta_curr.filing_date} (N)"
            )
            k1, k2, k3, k4, k5 = st.columns(5)
            k1.metric("Aligned Paragraph Pairs", len(pairs))
            k2.metric("Added in Period N", f"+{sum(1 for p in pairs if p.category == ChangeCategory.ADDED)}")
            k3.metric("Reworded Disclosures", sum(1 for p in pairs if p.category == ChangeCategory.REWORDED))
            k4.metric("Removed from N-1", f"-{sum(1 for p in pairs if p.category == ChangeCategory.REMOVED)}")
            k5.metric("New Risk Language Ratio", f"{new_risk_ratio * 100:.2f}%")

            topics = sorted({p.analysis.topic for p in pairs if p.analysis and p.analysis.topic})
            selected_topics = st.multiselect("Filter by Topic", options=topics, default=topics)
            selected_cats = st.multiselect(
                "Filter by Category",
                options=[c.value for c in ChangeCategory],
                default=["added", "removed", "reworded", "unchanged"],
            )

            filtered_pairs = [
                p
                for p in pairs
                if p.category.value in selected_cats
                and (not topics or (p.analysis and p.analysis.topic in selected_topics) or not p.analysis)
            ]

            st.markdown("### Ranked List of Most Material Changes (Pydantic Structured LLM Schema)")
            ranked = sorted(
                [p for p in filtered_pairs if p.analysis and p.category != ChangeCategory.UNCHANGED],
                key=lambda p: (p.analysis.materiality if p.analysis else 0, 1.0 - p.similarity),
                reverse=True,
            )
            if ranked:
                rank_df = pd.DataFrame(
                    [
                        {
                            "Rank": f"#{idx + 1}",
                            "Materiality": f"{p.analysis.materiality} / 5",
                            "Topic": p.analysis.topic,
                            "Direction": p.analysis.direction.value,
                            "Change & Sim": f"{p.category.value.upper()} · {p.similarity:.3f}",
                            "Uncertain?": p.analysis.is_uncertain,
                            "One-Sentence Plain-Language Summary": p.analysis.summary,
                        }
                        for idx, p in enumerate(ranked)
                        if p.analysis
                    ]
                )
                st.dataframe(rank_df, use_container_width=True, hide_index=True)

            st.markdown("### Side-by-Side Paragraph Diff")
            for pair in filtered_pairs:
                render_side_by_side_row(pair)

    with tab_event:
        st.warning(EXPLORATORY_WARNING)
        tickers_input = st.text_input(
            "Cohort Tickers (comma-separated)",
            value=", ".join(cfg["event_study"]["default_tickers"]),
        )
        if st.button("Run Exploratory Event Study", type="primary"):
            ticker_list = [t.strip().upper() for t in tickers_input.split(",") if t.strip()]
            ingestor = EdgarIngestor(
                user_agent=user_agent,
                cache_dir=cfg["edgar"]["cache_dir"],
                requests_per_sec=float(cfg["edgar"]["rate_limit_requests_per_sec"]),
            )
            aligner = ParagraphAligner(
                model_name=cfg["alignment"]["embedding_model"],
                unchanged_threshold=unchanged_thresh,
                reworded_threshold=reworded_thresh,
            )
            observations: list[EventStudyObservation] = []
            progress = st.progress(0)
            for idx, tk in enumerate(ticker_list):
                try:
                    filings = ingestor.list_consecutive_filings(tk, form_type="10-K", count=2)
                    (m_curr, u_curr), (m_prev, u_prev) = filings[0], filings[1]
                    h_curr = ingestor.download_filing_html(m_curr, u_curr)
                    h_prev = ingestor.download_filing_html(m_prev, u_prev)
                    s_curr = ingestor.extract_section_html_or_text(h_curr, "risk_factors", "10-K")
                    s_prev = ingestor.extract_section_html_or_text(h_prev, "risk_factors", "10-K")
                    p_curr = ingestor.split_into_paragraphs(s_curr)
                    p_prev = ingestor.split_into_paragraphs(s_prev)
                    aligned = aligner.align_paragraphs(p_prev, p_curr, section="Risk Factors")
                    ratio = aligner.compute_new_risk_language_ratio(aligned)
                    vol = fetch_next_quarter_volatility(tk, m_curr.filing_date)
                    observations.append(
                        EventStudyObservation(
                            ticker=tk,
                            filing_date_current=m_curr.filing_date,
                            filing_date_prior=m_prev.filing_date,
                            total_paragraphs_current=len(p_curr),
                            added_paragraphs=sum(1 for a in aligned if a.category == ChangeCategory.ADDED),
                            reworded_paragraphs=sum(1 for a in aligned if a.category == ChangeCategory.REWORDED),
                            removed_paragraphs=sum(1 for a in aligned if a.category == ChangeCategory.REMOVED),
                            new_risk_language_ratio=ratio,
                            next_quarter_volatility_annualized=vol,
                        )
                    )
                except Exception as exc:
                    st.info(f"Skipped {tk}: {exc}")
                progress.progress((idx + 1) / max(1, len(ticker_list)))

            if len(observations) >= 3:
                result = evaluate_event_study(observations)
                c1, c2, c3, c4, c5 = st.columns(5)
                c1.metric("Sample Size (N)", result.sample_size)
                c2.metric("Pearson r", f"{result.pearson_r:.4f}")
                c3.metric("Pearson p-value", f"{result.pearson_p_value:.4f}")
                c4.metric("Spearman rho", f"{result.spearman_rho:.4f}")
                c5.metric("Spearman p-value", f"{result.spearman_p_value:.4f}")

                obs_df = pd.DataFrame([o.model_dump() for o in result.observations])
                st.dataframe(obs_df, use_container_width=True, hide_index=True)
                st.scatter_chart(
                    obs_df,
                    x="new_risk_language_ratio",
                    y="next_quarter_volatility_annualized",
                )


if __name__ == "__main__":
    main()
