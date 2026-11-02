from __future__ import annotations

from typing import Callable, Optional
import numpy as np

from src.models import AlignedParagraphPair, ChangeCategory


class ParagraphAligner:
    """Aligns paragraphs between Period N-1 and Period N using sentence-transformers embeddings."""

    def __init__(
        self,
        model_name: str = "all-MiniLM-L6-v2",
        unchanged_threshold: float = 0.88,
        reworded_threshold: float = 0.55,
        embedder_fn: Optional[Callable[[list[str]], np.ndarray]] = None,
    ) -> None:
        if not (0.0 < reworded_threshold < unchanged_threshold <= 1.0):
            raise ValueError("Thresholds must satisfy 0 < reworded_threshold < unchanged_threshold <= 1.0")
        self.model_name = model_name
        self.unchanged_threshold = unchanged_threshold
        self.reworded_threshold = reworded_threshold
        self._embedder_fn = embedder_fn
        self._st_model = None

    def encode(self, texts: list[str]) -> np.ndarray:
        """Encodes a list of paragraphs into L2-normalized embedding vectors."""
        if not texts:
            return np.zeros((0, 384), dtype=np.float32)

        if self._embedder_fn is not None:
            vecs = self._embedder_fn(texts)
            norms = np.linalg.norm(vecs, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            return (vecs / norms).astype(np.float32)

        if self._st_model is None:
            from sentence_transformers import SentenceTransformer

            self._st_model = SentenceTransformer(self.model_name)

        embeddings = self._st_model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return np.asarray(embeddings, dtype=np.float32)

    @staticmethod
    def cosine_similarity_matrix(vecs_old: np.ndarray, vecs_new: np.ndarray) -> np.ndarray:
        """Computes pairwise cosine similarity matrix of shape (len(old), len(new))."""
        if vecs_old.size == 0 or vecs_new.size == 0:
            return np.zeros((vecs_old.shape[0], vecs_new.shape[0]), dtype=np.float32)
        sim = np.matmul(vecs_old, vecs_new.T)
        return np.clip(sim, 0.0, 1.0)

    def align_paragraphs(
        self,
        paragraphs_old: list[str],
        paragraphs_new: list[str],
        section: str = "Risk Factors",
    ) -> list[AlignedParagraphPair]:
        """
        Matches paragraphs between Year N-1 (old) and Year N (new) by greedy maximum cosine similarity
        above `reworded_threshold`, classifying each as unchanged, reworded, added, or removed.
        """
        if not paragraphs_old and not paragraphs_new:
            return []

        if not paragraphs_old:
            return [
                AlignedParagraphPair(
                    pair_id=f"{section}-add-{j}",
                    section=section,
                    category=ChangeCategory.ADDED,
                    similarity=0.0,
                    old_index=None,
                    new_index=j,
                    old_text=None,
                    new_text=text_new,
                )
                for j, text_new in enumerate(paragraphs_new)
            ]

        if not paragraphs_new:
            return [
                AlignedParagraphPair(
                    pair_id=f"{section}-rem-{i}",
                    section=section,
                    category=ChangeCategory.REMOVED,
                    similarity=0.0,
                    old_index=i,
                    new_index=None,
                    old_text=text_old,
                    new_text=None,
                )
                for i, text_old in enumerate(paragraphs_old)
            ]

        vecs_old = self.encode(paragraphs_old)
        vecs_new = self.encode(paragraphs_new)
        sim_matrix = self.cosine_similarity_matrix(vecs_old, vecs_new)

        matched_old: set[int] = set()
        matched_new: set[int] = set()
        aligned_pairs: list[AlignedParagraphPair] = []

        # Collect all candidate (i, j) pairs with similarity >= reworded_threshold
        candidates: list[tuple[float, int, int]] = []
        for i in range(len(paragraphs_old)):
            for j in range(len(paragraphs_new)):
                score = float(sim_matrix[i, j])
                if score >= self.reworded_threshold:
                    candidates.append((score, i, j))

        # Sort descending by similarity for greedy 1-to-1 bipartite matching
        candidates.sort(key=lambda item: item[0], reverse=True)

        for score, i, j in candidates:
            if i in matched_old or j in matched_new:
                continue
            matched_old.add(i)
            matched_new.add(j)

            # Exact string match or similarity >= unchanged_threshold -> UNCHANGED
            if paragraphs_old[i].strip() == paragraphs_new[j].strip():
                category = ChangeCategory.UNCHANGED
                score = 1.0
            elif score >= self.unchanged_threshold:
                category = ChangeCategory.UNCHANGED
            else:
                category = ChangeCategory.REWORDED

            aligned_pairs.append(
                AlignedParagraphPair(
                    pair_id=f"{section}-match-{i}-{j}",
                    section=section,
                    category=category,
                    similarity=round(score, 4),
                    old_index=i,
                    new_index=j,
                    old_text=paragraphs_old[i],
                    new_text=paragraphs_new[j],
                )
            )

        # Unmatched in Year N -> ADDED
        for j, text_new in enumerate(paragraphs_new):
            if j not in matched_new:
                best_old_sim = float(np.max(sim_matrix[:, j])) if sim_matrix.shape[0] > 0 else 0.0
                aligned_pairs.append(
                    AlignedParagraphPair(
                        pair_id=f"{section}-add-{j}",
                        section=section,
                        category=ChangeCategory.ADDED,
                        similarity=round(best_old_sim, 4),
                        old_index=None,
                        new_index=j,
                        old_text=None,
                        new_text=text_new,
                    )
                )

        # Unmatched in Year N-1 -> REMOVED
        for i, text_old in enumerate(paragraphs_old):
            if i not in matched_old:
                best_new_sim = float(np.max(sim_matrix[i, :])) if sim_matrix.shape[1] > 0 else 0.0
                aligned_pairs.append(
                    AlignedParagraphPair(
                        pair_id=f"{section}-rem-{i}",
                        section=section,
                        category=ChangeCategory.REMOVED,
                        similarity=round(best_new_sim, 4),
                        old_index=i,
                        new_index=None,
                        old_text=text_old,
                        new_text=None,
                    )
                )

        # Sort in natural reading order (by new_index when present, else old_index)
        aligned_pairs.sort(
            key=lambda p: (
                p.new_index if p.new_index is not None else (p.old_index or 0),
                0 if p.new_index is not None else 1,
            )
        )
        return aligned_pairs

    @staticmethod
    def compute_new_risk_language_ratio(pairs: list[AlignedParagraphPair]) -> float:
        """
        Computes the fraction of Year N risk language (by word count) that is either
        newly ADDED or REWORDED relative to Year N-1.
        """
        total_new_words = 0
        changed_new_words = 0
        for pair in pairs:
            if pair.new_text:
                words_n = len(pair.new_text.split())
                total_new_words += words_n
                if pair.category == ChangeCategory.ADDED:
                    changed_new_words += words_n
                elif pair.category == ChangeCategory.REWORDED:
                    # Weight reworded paragraphs by semantic divergence (1 - similarity)
                    divergence = max(0.15, 1.0 - pair.similarity)
                    changed_new_words += int(round(words_n * divergence))

        if total_new_words == 0:
            return 0.0
        return round(min(1.0, changed_new_words / total_new_words), 4)
