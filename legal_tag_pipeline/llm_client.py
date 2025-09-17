from __future__ import annotations
from typing import Protocol

try:
    import google.generativeai as genai  # type: ignore
except Exception:  # pragma: no cover
    genai = None  # type: ignore

class LLMClient(Protocol):
    def correct_tags(self, prompt: str, text: str) -> str: ...

class GeminiClient:
    def __init__(self, api_key: str, model: str = "gemini-1.5-flash"):
        if genai is None:
            raise RuntimeError("google-generativeai não instalado.")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model)

    def correct_tags(self, prompt: str, text: str) -> str:
        full_prompt = f"{prompt}\n\n=== TEXTO ALVO ===\n{text}\n\n=== FIM ==="
        resp = self.model.generate_content(full_prompt)
        return getattr(resp, 'text', '') or ''

class FakeLLMClient:
    def correct_tags(self, prompt: str, text: str) -> str:  # type: ignore[override]
        return text
