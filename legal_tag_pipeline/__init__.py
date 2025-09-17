"""Legal Tag Pipeline - revisão, correção e validação de tags jurídicas.

Este pacote provê uma pipeline completa para:
1. Revisar tags geradas (ex: por OCR + LLM rápido)
2. Corrigir apenas erros detectados
3. Validar e iterar até atingir perfeição dentro de limites configuráveis

Uso rápido:

from legal_tag_pipeline import quick_process
resultado = quick_process(texto, api_key="SUA_KEY")
if resultado.success:
    print("Documento perfeito!")
"""
from .gemini_fast_processor import create_processor, quick_process, GeminiFastProcessor
from .models import ProcessResult, ValidationResult, ReviewIssue, QualityStatus

__all__ = [
    "create_processor",
    "quick_process",
    "GeminiFastProcessor",
    "ProcessResult",
    "ValidationResult",
    "ReviewIssue",
    "QualityStatus",
]
