from __future__ import annotations

import logging
import os
from typing import Optional

from google import genai
from google.genai import types

from src.models import AlignedParagraphPair, CautionDirection, ChangeCategory, ParagraphAnalysis

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are a senior SEC financial filing analyst comparing consecutive 10-K/10-Q disclosures.
Analyze the provided paragraph change (ADDED, REMOVED, or REWORDED) between Period N-1 and Period N.

Rules:
1. Return strict JSON matching the requested schema.
2. `topic`: A concise 2-4 word risk/operational category (e.g., 'Cybersecurity & Data Privacy', 'Supply Chain & Tariffs', 'AI & Regulatory Compliance', 'Liquidity & Debt Covenants').
3. `direction`:
   - 'more_cautious' if the company adds new risk warnings, expands threat scope, escalates severity, or softens positive assurances.
   - 'less_cautious' if a prior risk warning is removed or retired, or language shifts from acute threat to mitigated/resolved.
   - 'neutral' if the change updates dates, routine figures, or formatting without altering risk posture.
   - 'uncertain' if you cannot determine whether the change is more or less cautious from the excerpt alone.
4. `materiality`: Integer 1 to 5:
   - 1: Minor editorial or date update.
   - 2: Routine clarification of existing boilerplate risk.
   - 3: Notable update to operational, competitive, or regulatory language.
   - 4: Significant new risk factor or concrete disclosure of an adverse event/investigation.
   - 5: Critical change in liquidity, going-concern, major litigation, material weakness, or core business model threat.
5. `summary`: Exactly ONE plain-language sentence explaining what changed and why it matters.
6. Epistemic humility: If the excerpt is ambiguous, truncated, or lacks context, set `is_uncertain: true`, set `direction: "uncertain"`, and explicitly state in `summary` that the impact is uncertain rather than guessing."""


class GeminiDiffAnalyzer:
    """Analyzes added, removed, and reworded filing paragraphs using Google Gemini (`google-genai`)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gemini-2.5-flash",
    ) -> None:
        resolved_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not resolved_key:
            raise EnvironmentError(
                "GEMINI_API_KEY environment variable is not set. Set GEMINI_API_KEY before running LLM analysis."
            )
        self.client = genai.Client(api_key=resolved_key)
        self.model_name = model_name

    def analyze_pair(self, pair: AlignedParagraphPair) -> ParagraphAnalysis:
        """Calls Gemini with structured Pydantic output (`response_schema=ParagraphAnalysis`)."""
        if pair.category == ChangeCategory.UNCHANGED:
            return ParagraphAnalysis(
                topic="Unchanged Disclosure",
                direction=CautionDirection.NEUTRAL,
                materiality=1,
                summary="No meaningful change in language between Period N-1 and Period N.",
                is_uncertain=False,
            )

        prompt_parts = [
            f"Section: {pair.section}",
            f"Change Type: {pair.category.value.upper()}",
            f"Embedding Cosine Similarity: {pair.similarity:.3f}",
            f"Period N-1 (Prior Filing) Paragraph:\n{pair.old_text or '[NONE — Paragraph did not exist in Period N-1]'}",
            f"Period N (Current Filing) Paragraph:\n{pair.new_text or '[NONE — Paragraph was removed in Period N]'}",
        ]
        prompt = "\n\n".join(prompt_parts)

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=ParagraphAnalysis,
                    temperature=0.1,
                ),
            )
            if response.parsed and isinstance(response.parsed, ParagraphAnalysis):
                return response.parsed
            if response.text:
                return ParagraphAnalysis.model_validate_json(response.text)
            raise ValueError("Empty response from Gemini API.")
        except Exception as exc:
            logger.warning("Gemini analysis failed for pair %s: %s", pair.pair_id, exc)
            return ParagraphAnalysis(
                topic="Uncertain / API Error",
                direction=CautionDirection.UNCERTAIN,
                materiality=1,
                summary="Model could not confidently analyze this paragraph due to an upstream error or ambiguous excerpt; refusing to guess.",
                is_uncertain=True,
            )

    def analyze_material_changes(
        self,
        pairs: list[AlignedParagraphPair],
        max_paragraphs: int = 25,
    ) -> list[AlignedParagraphPair]:
        """Analyzes non-unchanged paragraphs and attaches `ParagraphAnalysis` to each pair."""
        changed = [p for p in pairs if p.category != ChangeCategory.UNCHANGED]
        # Prioritize added, removed, and lowest-similarity reworded paragraphs
        changed.sort(key=lambda p: p.similarity)
        target_ids = {p.pair_id for p in changed[:max_paragraphs]}

        enriched: list[AlignedParagraphPair] = []
        for pair in pairs:
            if pair.pair_id in target_ids:
                analysis = self.analyze_pair(pair)
                enriched.append(pair.model_copy(update={"analysis": analysis}))
            else:
                enriched.append(pair)
        return enriched
