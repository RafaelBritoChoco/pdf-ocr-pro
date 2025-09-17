"""Extrai texto da primeira página de um PDF e roda a pipeline de revisão.

Uso:
  python extract_and_review.py caminho\arquivo.pdf --api-key SUA_KEY

Sem --api-key funciona apenas com revisão heurística (sem correções LLM).
"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys
from typing import Optional

from legal_tag_pipeline import quick_process

try:
    from PyPDF2 import PdfReader  # type: ignore
except Exception as e:  # pragma: no cover
    print("Erro importando PyPDF2: instale dependências (pip install -r requirements.txt)", file=sys.stderr)
    raise


def extract_first_page_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    if not reader.pages:
        return ""
    page = reader.pages[0]
    text = page.extract_text() or ""
    return text.strip()


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Extrai primeira página e revisa tags")
    p.add_argument("pdf", help="Caminho do PDF (1 página ou multi)")
    p.add_argument("--api-key", dest="api_key", help="Chave Gemini (ou env GEMINI_API_KEY)")
    p.add_argument("--show-content", action="store_true", help="Printar conteúdo final corrigido")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    pdf_path = Path(args.pdf)
    if not pdf_path.is_file():
        print("Arquivo PDF não encontrado", file=sys.stderr)
        return 2
    raw_text = extract_first_page_text(pdf_path)
    if not raw_text:
        print("Nenhum texto extraído da primeira página.", file=sys.stderr)
    result = quick_process(raw_text, api_key=args.api_key)
    print("Status:", result.validation_result.status)
    print("Erros detectados:", result.review_result.error_count)
    if result.review_result.issues:
        for issue in result.review_result.issues[:10]:
            print(f"- [{issue.severity}] {issue.issue_type}: {issue.message}")
    if args.show_content:
        print("\n=== CONTEÚDO FINAL (primeiros 800 chars) ===")
        print(result.final_content[:800])
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
