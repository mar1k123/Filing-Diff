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
    ChangeCategory.ADDED: ("#dcfce7", "#166534", "ADDED"),
    ChangeCategory.REMOVED: ("#fee2e2", "#991b1b", "REMOVED"),
    ChangeCategory.REWORDED: ("#fef3c7", "#92400e", "REWORDED"),
    ChangeCategory.UNCHANGED: ("#f8fafc", "#475569", "UNCHANGED"),
}


def render_side_by_side_row(pair: AlignedParagraphPair) -> None:
    bg_color, text_color, badge_label = COLOR_MAP[pair.category]
    topic_str = pair.analysis.topic if pair.analysis else "Unanalyzed"
    mat_str = f"Materiality {pair.analysis.materiality}/5" if pair.analysis else ""
    dir_str = pair.analysis.direction.value if pair.analysis else ""

    st.markdown(
        f"""
        <div style="border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:12px; background:{bg_color};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; color:{text_color}; font-size:13px; font-weight:600;">
                <span>{badge_label} · Cosine Sim: {pair.similarity:.3f} · Topic: {topic_str}</span>
                <span>{mat_str} {f'· ({dir_str})' if dir_str else ''}</span>
            </div>
            {f'<div style="font-size:13px; color:#0f172a; margin-bottom:8px;"><strong>Summary:</strong> {pair.analysis.summary}</div>' if pair.analysis else ''}
        </div>
        """,
        unsafe_allow_html=True,
    )
    col_left, col_right = st.columns(2)
    with col_left:
        st.caption(f"Period N-1 (Paragraph #{pair.old_index if pair.old_index is not None else '—'})")
        st.write(pair.old_text or "_[Not present in prior filing]_")
    with col_right:
        st.caption(f"Period N (Paragraph #{pair.new_index if pair.new_index is not None else '—'})")
        st.write(pair.new_text or "_[Removed in current filing]_")


def main() -> None:
    st.set_page_config(page_title="filing-diff | SEC 10-K/10-Q Analyzer", layout="wide")
    cfg = load_config()

    st.title("filing-diff: SEC 10-K / 10-Q Semantic Diff & Risk Analyzer")
    st.caption(
        "Compares consecutive SEC EDGAR filings via paragraph embeddings and Google Gemini structured analysis. "
        "Not financial advice."
    )

    with st.sidebar:
        st.header("Ingestion & Alignment")
        user_agent = st.text_input(
            "SEC EDGAR User-Agent",
            value=os.environ.get("SEC_USER_AGENT", cfg["edgar"]["user_agent"]),
        )
        ticker = st.text_input("Ticker Symbol", value="AAPL").strip().upper()
        form_type: Literal["10-K", "10-Q"] = st.selectbox("Form Type", ["10-K", "10-Q"])  # type: ignore[assignment]
        section_choice = st.selectbox(
            "Filing Section",
            options=[("risk_factors", "Item 1A — Risk Factors"), ("mda", "Item 7 / Item 2 — MD&A")],
            format_func=lambda x: x[1],
        )[0]
        unchanged_thresh = st.slider(
            "Unchanged Cosine Threshold", 0.75, 0.98, float(cfg["alignment"]["unchanged_threshold"]), 0.01
        )
        reworded_thresh = st.slider(
            "Reworded Cosine Threshold", 0.35, 0.74, float(cfg["alignment"]["reworded_threshold"]), 0.01
        )
        run_llm = st.checkbox("Run Gemini Structured Analysis (requires GEMINI_API_KEY)", value=True)
        run_btn = st.button("Compare Consecutive Filings", type="primary")

    tab_diff, tab_event = st.tabs(["1. Filing Diff & Ranked Material Changes", "2. Exploratory Event Study"])

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
            k1.metric("Total Aligned Pairs", len(pairs))
            k2.metric("Added", sum(1 for p in pairs if p.category == ChangeCategory.ADDED))
            k3.metric("Removed", sum(1 for p in pairs if p.category == ChangeCategory.REMOVED))
            k4.metric("Reworded", sum(1 for p in pairs if p.category == ChangeCategory.REWORDED))
            k5.metric("New Risk Language Ratio", f"{new_risk_ratio * 100:.1f}%")

            topics = sorted({p.analysis.topic for p in pairs if p.analysis and p.analysis.topic})
            selected_topics = st.multiselect("Filter by Topic", options=topics, default=topics)
            selected_cats = st.multiselect(
                "Filter by Category",
                options=[c.value for c in ChangeCategory],
                default=["added", "removed", "reworded"],
            )

            filtered_pairs = [
                p
                for p in pairs
                if p.category.value in selected_cats
                and (not topics or (p.analysis and p.analysis.topic in selected_topics) or not p.analysis)
            ]

            st.markdown("### Ranked List of Most Material Changes")
            ranked = sorted(
                [p for p in filtered_pairs if p.analysis],
                key=lambda p: (p.analysis.materiality if p.analysis else 0, 1.0 - p.similarity),
                reverse=True,
            )
            if ranked:
                rank_df = pd.DataFrame(
                    [
                        {
                            "Rank": idx + 1,
                            "Materiality (1-5)": p.analysis.materiality,
                            "Topic": p.analysis.topic,
                            "Direction": p.analysis.direction.value,
                            "Category": p.category.value.upper(),
                            "Similarity": p.similarity,
                            "Uncertain?": p.analysis.is_uncertain,
                            "One-Sentence Summary": p.analysis.summary,
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
        if st.button("Run Exploratory Event Study"):
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
