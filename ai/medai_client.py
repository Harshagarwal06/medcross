"""
medai_client.py — MedCross AI client via Hugging Face Inference Providers.

Routes OpenAI-SDK-compatible chat completion requests through the
Hugging Face router (https://router.huggingface.co/v1) to the
Qwen/Qwen3.5-9B model served by Together AI.

Authentication:
    Reads the Hugging Face token from the HF_TOKEN environment variable.
    Never hardcode the token in this file.

        export HF_TOKEN="hf_..."

Usage:
    from medai_client import MedAI

    ai = MedAI()
    print(ai.explain_clue("Thin vessel for gas exchange", "cardiology"))
"""

from __future__ import annotations

import os
import re

from openai import OpenAI, APIError, APITimeoutError

BASE_URL = "https://router.huggingface.co/v1"
MODEL_ID = "Qwen/Qwen3.5-9B:together"

DEFAULT_TEMPERATURE = 0.65
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_MAX_RETRIES = 2


class MedAIError(RuntimeError):
    """Raised when the AI backend cannot produce a response."""


class MedAI:
    """Medical-education AI helpers for the MedCross crossword app."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = MODEL_ID,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ) -> None:
        key = api_key or os.environ.get("HF_TOKEN")
        if not key:
            raise MedAIError(
                "Missing Hugging Face token: set the HF_TOKEN environment "
                "variable (export HF_TOKEN=hf_...) or pass api_key=."
            )
        self.model = model
        self.client = OpenAI(
            base_url=BASE_URL,
            api_key=key,
            timeout=timeout,
            max_retries=max_retries,
        )

    # ── Core call ────────────────────────────────────────────────────────────
    def _chat(self, prompt: str, max_tokens: int = 280) -> str:
        # Qwen3-family models emit internal reasoning before the answer, so the
        # token budget must cover thinking + reply or content comes back empty.
        budget = max(max_tokens * 8, 2000)
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=budget,
                temperature=DEFAULT_TEMPERATURE,
            )
        except APITimeoutError as exc:
            raise MedAIError("AI request timed out — please try again.") from exc
        except APIError as exc:
            raise MedAIError(f"AI backend error: {exc.message}") from exc

        if not response.choices:
            raise MedAIError("AI returned an empty response.")
        message = response.choices[0].message
        text = self._extract_answer(message)
        if not text:
            raise MedAIError("AI returned an empty response.")
        return text

    @staticmethod
    def _extract_answer(message) -> str:
        """Pull the final answer out of a (possibly reasoning) model reply."""
        content = (message.content or "").strip()
        # Strip an inline <think>...</think> block if the provider includes one.
        if content:
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        if content:
            return content
        # Some providers put reasoning in a separate field; if the answer never
        # made it to content, salvage the text after the reasoning ends.
        reasoning = (getattr(message, "reasoning_content", None) or "").strip()
        if "</think>" in reasoning:
            return reasoning.split("</think>", 1)[1].strip()
        return ""

    # ── Crossword features (same behavior the Gemini version provided) ──────
    def explain_clue(self, clue: str, category: str = "medicine") -> str:
        """Explain the medical concept behind a clue in plain English."""
        prompt = (
            "You are a medical education assistant helping a student solve a "
            "medical crossword.\n\n"
            f'Clue: "{clue}"\n'
            f"Category: {category}\n\n"
            "Explain the medical concept behind this clue in 2-3 clear "
            "sentences. Cover: what it is, its clinical significance, and one "
            "memorable fact. Be concise and educational. Do not mention it is "
            "a crossword clue."
        )
        return self._chat(prompt, max_tokens=220)

    def hint_for_clue(
        self,
        clue: str,
        known_letters: str | None = None,
        category: str = "medicine",
    ) -> str:
        """Give a soft hint without revealing the answer."""
        letters = f"\nKnown letters so far: {known_letters}" if known_letters else ""
        prompt = (
            "You are helping a medical student solve a crossword WITHOUT "
            "revealing the answer directly.\n\n"
            f'Clue: "{clue}"\n'
            f"Category: {category}{letters}\n\n"
            "Give ONE helpful nudge (1-2 sentences) that guides them toward "
            "the answer without stating it. Focus on a memorable clinical "
            "association or word etymology."
        )
        return self._chat(prompt, max_tokens=150)

    def learn_batch(self, terms: list[dict], category: str = "medicine") -> str:
        """Post-puzzle learning notes for solved terms (up to 5).

        Each term is a dict like {"answer": "CAPILLARY", "clue": "..."}.
        """
        if not terms:
            raise MedAIError("No terms provided for learning notes.")
        listing = "\n".join(
            f'{i + 1}. "{t["answer"]}" — clue: "{t["clue"]}"'
            for i, t in enumerate(terms[:5])
        )
        prompt = (
            "You are a medical education AI summarising what a student just "
            f"learned in a crossword puzzle (category: {category}).\n\n"
            f"Terms solved:\n{listing}\n\n"
            "For EACH term write ONE sentence covering its core clinical "
            "meaning. Format as a numbered list matching the numbering above. "
            "Be brief and educational."
        )
        return self._chat(prompt, max_tokens=400)


if __name__ == "__main__":
    # Smoke test: python3 medai_client.py
    ai = MedAI()
    print(ai.explain_clue("Thin vessel for gas exchange", "cardiology"))
