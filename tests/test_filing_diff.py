from __future__ import annotations

import numpy as np
import pytest
from pydantic import ValidationError

from src.alignment import ParagraphAligner
from src.event_study import evaluate_event_study
from src.ingestion import EdgarIngestor, RateLimiter
from src.models import (
    CautionDirection,
    ChangeCategory,
    EventStudyObservation,
    ParagraphAnalysis,
)


def deterministic_toy_embedder(texts: list[str]) -> np.ndarray:
    """Deterministic keyword-vector embedder for hermetic unit testing without downloading HuggingFace weights."""
    vocab = [
        "cybersecurity",
        "ransomware",
        "encryption",
        "supply",
        "chain",
        "semiconductor",
        "taiwan",
        "liquidity",
        "credit",
        "revolving",
        "artificial",
        "intelligence",
        "regulatory",
        "eu",
    ]
    mat = np.zeros((len(texts), len(vocab)), dtype=np.float32)
    for row_idx, t in enumerate(texts):
        tokens = t.lower().replace(".", "").replace(",", "").split()
        for col_idx, word in enumerate(vocab):
            mat[row_idx, col_idx] = float(tokens.count(word))
    return mat


def test_edgar_user_agent_and_rate_limiter_validation() -> None:
    with pytest.raises(ValueError, match="User-Agent"):
        EdgarIngestor(user_agent="InvalidUserAgentWithoutEmail")

    with pytest.raises(ValueError, match="rate_limit_requests_per_sec"):
        RateLimiter(requests_per_sec=15.0)


def test_section_extraction_and_paragraph_splitting() -> None:
    sample_html = """
    <html><body>
      <p>Table of Contents</p>
      <p>Item 1A. Risk Factors ..... 12</p>
      <p>Item 7. Management's Discussion and Analysis ..... 45</p>
      <div>
        <h2>ITEM 1A. RISK FACTORS</h2>
        <p>Short header</p>
        <p>We face heightened cybersecurity threats, including sophisticated ransomware and nation-state attacks targeting our cloud infrastructure and customer data repositories across global jurisdictions.</p>
        <p>Our global semiconductor supply chain depends on third-party foundries concentrated in East Asia, exposing our hardware delivery schedules to geopolitical disruptions and export controls.</p>
        <h2>ITEM 1B. UNRESOLVED STAFF COMMENTS</h2>
        <p>None.</p>
      </div>
    </body></html>
    """
    ingestor = EdgarIngestor(
        user_agent="FilingDiffTest/1.0 (test@example.org)",
        min_paragraph_chars=60,
    )
    extracted = ingestor.extract_section_html_or_text(sample_html, section="risk_factors", form_type="10-K")
    paragraphs = ingestor.split_into_paragraphs(extracted)

    assert len(paragraphs) == 2
    assert "cybersecurity threats" in paragraphs[0]
    assert "semiconductor supply chain" in paragraphs[1]


def test_paragraph_alignment_categories_and_risk_ratio() -> None:
    old_paras = [
        "Our liquidity position is supported by a revolving credit facility and cash equivalents sufficient for operations.",
        "We face cybersecurity risks from phishing and ransomware targeting our enterprise systems.",
        "Legacy patent litigation in domestic courts may result in minor legal expenses.",
    ]
    new_paras = [
        "Our liquidity position is supported by a revolving credit facility and cash equivalents sufficient for operations.",
        "We face heightened cybersecurity and ransomware risks targeting encryption keys and enterprise systems.",
        "New artificial intelligence regulatory compliance rules in the EU may restrict model deployment.",
    ]

    aligner = ParagraphAligner(
        unchanged_threshold=0.92,
        reworded_threshold=0.50,
        embedder_fn=deterministic_toy_embedder,
    )
    pairs = aligner.align_paragraphs(old_paras, new_paras, section="Risk Factors")
    categories = {p.category for p in pairs}

    assert ChangeCategory.UNCHANGED in categories
    assert ChangeCategory.REWORDED in categories
    assert ChangeCategory.ADDED in categories
    assert ChangeCategory.REMOVED in categories

    ratio = aligner.compute_new_risk_language_ratio(pairs)
    assert 0.25 <= ratio <= 0.75


def test_pydantic_paragraph_analysis_validation() -> None:
    valid = ParagraphAnalysis(
        topic="AI Regulatory Compliance",
        direction=CautionDirection.MORE_CAUTIOUS,
        materiality=4,
        summary="The company added a warning regarding EU AI Act compliance penalties and deployment restrictions.",
        is_uncertain=False,
    )
    assert valid.materiality == 4

    with pytest.raises(ValidationError):
        ParagraphAnalysis(
            topic="Invalid Materiality",
            direction=CautionDirection.MORE_CAUTIOUS,
            materiality=7,
            summary="Materiality out of range 1..5.",
        )


def test_event_study_correlation_math() -> None:
    obs = [
        EventStudyObservation(
            ticker="AAA",
            filing_date_current="2025-02-01",
            filing_date_prior="2024-02-01",
            total_paragraphs_current=40,
            added_paragraphs=2,
            reworded_paragraphs=4,
            removed_paragraphs=1,
            new_risk_language_ratio=0.10,
            next_quarter_volatility_annualized=0.22,
        ),
        EventStudyObservation(
            ticker="BBB",
            filing_date_current="2025-02-01",
            filing_date_prior="2024-02-01",
            total_paragraphs_current=50,
            added_paragraphs=6,
            reworded_paragraphs=8,
            removed_paragraphs=2,
            new_risk_language_ratio=0.20,
            next_quarter_volatility_annualized=0.31,
        ),
        EventStudyObservation(
            ticker="CCC",
            filing_date_current="2025-02-01",
            filing_date_prior="2024-02-01",
            total_paragraphs_current=45,
            added_paragraphs=9,
            reworded_paragraphs=10,
            removed_paragraphs=3,
            new_risk_language_ratio=0.30,
            next_quarter_volatility_annualized=0.29,
        ),
        EventStudyObservation(
            ticker="DDD",
            filing_date_current="2025-02-01",
            filing_date_prior="2024-02-01",
            total_paragraphs_current=60,
            added_paragraphs=15,
            reworded_paragraphs=12,
            removed_paragraphs=4,
            new_risk_language_ratio=0.40,
            next_quarter_volatility_annualized=0.42,
        ),
    ]
    res = evaluate_event_study(obs)
    assert res.sample_size == 4
    assert res.pearson_r > 0.80
    assert 0.0 <= res.pearson_p_value <= 1.0
    assert "EXPLORATORY ANALYSIS ONLY" in res.methodological_warning
