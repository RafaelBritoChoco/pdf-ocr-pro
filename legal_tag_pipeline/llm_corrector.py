from __future__ import annotations
from typing import List
from .models import ReviewResult
from .llm_client import LLMClient

CORRECTION_SYSTEM_PROMPT = (
    "Você é um assistente especializado em documentos jurídicos brasileiros. "
    "Receberá um TEXTO e uma LISTA DE PROBLEMAS DETECTADOS. "
    "REGRAS: \n"
    "1. Corrigir SOMENTE o que for necessário para resolver os problemas listados.\n"
    "2. NÃO reescrever trechos corretos.\n"
    "3. Manter estrutura e conteúdo.\n"
    "4. Preservar acentuação e pontuação.\n"
    "5. Não adicionar explicações fora do texto corrigido.\n"
    "Saída: devolver apenas o TEXTO CORRIGIDO."
)

class LLMCorrector:
    def __init__(self, client: LLMClient):
        self.client = client

    def correct(self, content: str, review: ReviewResult) -> str:
        if not review.issues:
            return content
        problem_lines: List[str] = []
        for i, issue in enumerate(review.issues, 1):
            problem_lines.append(
                f"{i}. tipo={issue.issue_type} severidade={issue.severity} conf={issue.confidence:.2f} -> {issue.message} | sugestao={issue.suggestion or '-'}"
            )
        problems_block = "\n".join(problem_lines[:25])
        prompt = f"{CORRECTION_SYSTEM_PROMPT}\n\nPROBLEMAS DETECTADOS:\n{problems_block}"
        return self.client.correct_tags(prompt, content)
