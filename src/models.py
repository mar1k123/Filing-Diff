from __future__ import annotations

from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class ChangeCategory(str, Enum):
    UNCHANGED = "unchanged"
    REWORDED = "reworded"
    ADDED = "added"
    REMOVED = "removed"


class CautionDirection(str, Enum):
    MORE_CAUTIOUS = "more_cautious"
    LESS_CAUTIOUS = "less_cautious"
    NEUTRAL = "neutral"
    UNCERTAIN = "uncertain"


class ParagraphAnalysis(BaseModel):
    """Strict schema returned by Gemini for added, removed, or reworded paragraphs."""

    topic: str = Field(
        ...,
        min_length=2,
        max_length=80,
        description="Concise risk or operational topic (e.g., 'Cybersecurity', 'Supply Chain', 'AI Regulation'). If unsure, state 'Uncertain / Unclear'.",
    )
    direction: CautionDirection = Field(
        ...,
        description="Whether the change makes the disclosure more_cautious, less_cautious, neutral, or uncertain. Do not guess if ambiguous.",
    )
    materiality: int = Field(
        ...,
        ge=1,
        le=5,
        description="Materiality score from 1 (minor boilerplate tweak) to 5 (major new operational, legal, or financial disclosure).",
    )
    summary: str = Field(
        ...,
        min_length=10,
        max_length=320,
        description="One-sentence plain-language summary of the change. If uncertain, explicitly state what is unclear rather than guessing.",
    )
    is_uncertain: bool = Field(
        default=False,
        description="True if the model lacks sufficient context to determine direction or materiality with confidence.",
    )

    @field_validator("summary")
    @classmethod
    def enforce_single_sentence(cls, value: str) -> str:
        cleaned = " ".join(value.strip().split())
        if not cleaned:
            raise ValueError("Summary must not be empty.")
        return cleaned


class AlignedParagraphPair(BaseModel):
    """Represents an aligned pair of paragraphs between Period N-1 and Period N."""

    pair_id: str
    section: str
    category: ChangeCategory
    similarity: float = Field(..., ge=0.0, le=1.0)
    old_index: Optional[int] = None
    new_index: Optional[int] = None
    old_text: Optional[str] = None
    new_text: Optional[str] = None
    analysis: Optional[ParagraphAnalysis] = None


class FilingMetadata(BaseModel):
    ticker: str
    cik: str
    form_type: Literal["10-K", "10-Q"]
    filing_date: str
    accession_number: str
    report_period: str


class EventStudyObservation(BaseModel):
    ticker: str
    filing_date_current: str
    filing_date_prior: str
    total_paragraphs_current: int
    added_paragraphs: int
    reworded_paragraphs: int
    removed_paragraphs: int
    new_risk_language_ratio: float = Field(
        ..., ge=0.0, le=1.0, description="Fraction of current risk text classified as added or substantially reworded."
    )
    next_quarter_volatility_annualized: float = Field(
        ..., ge=0.0, description="Annualized standard deviation of daily log returns over 63 trading days post-filing."
    )


class EventStudyResult(BaseModel):
    sample_size: int
    pearson_r: float
    pearson_p_value: float
    spearman_rho: float
    spearman_p_value: float
    ols_slope: float
    ols_intercept: float
    observations: list[EventStudyObservation]
    methodological_warning: str
