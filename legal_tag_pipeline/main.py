from __future__ import annotations
import argparse
import sys
import os
from pathlib import Path
from .gemini_fast_processor import create_processor

def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Pipeline de revisão/correção de tags jurídicas")
    p.add_argument("entrada", help="Arquivo ou pasta de entrada")
    p.add_argument("-o", "--output", required=True, help="Arquivo ou pasta de saída")
    p.add_argument("--api-key", dest="api_key", help="Chave API Gemini (ou GEMINI_API_KEY env)")
    p.add_argument("--strict", action="store_true", help="Não aceitar status WARNING")
    p.add_argument("--iterations", type=int, default=3, help="Máx. iterações de correção")
    p.add_argument("--batch", action="store_true", help="Processar pasta inteira")
    p.add_argument("--pattern", default="*.txt", help="Glob de arquivos para --batch")
    return p.parse_args(argv)

def process_single(path_in: Path, path_out: Path, processor):
    text = path_in.read_text(encoding="utf-8", errors="ignore")
    result = processor.process_document(text)
    path_out.write_text(result.final_content, encoding="utf-8")
    status = result.validation_result.status
    print(f"[ {status} ] {path_in.name} -> {path_out}")
    return result

def main(argv=None):
    args = parse_args(argv)
    api_key = args.api_key or os.getenv("GEMINI_API_KEY")
    processor = create_processor(api_key=api_key, max_correction_iterations=args.iterations, auto_accept_minor_issues=not args.strict)

    in_path = Path(args.entrada)
    out_path = Path(args.output)

    if args.batch:
        if not in_path.is_dir():
            print("Entrada deve ser uma pasta quando --batch", file=sys.stderr)
            return 2
        out_path.mkdir(parents=True, exist_ok=True)
        for file in in_path.rglob(args.pattern):
            if file.is_file():
                rel = file.relative_to(in_path)
                target = out_path / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                process_single(file, target, processor)
        return 0
    else:
        if not in_path.is_file():
            print("Entrada deve ser um arquivo", file=sys.stderr)
            return 2
        if out_path.is_dir():
            out_file = out_path / in_path.name
        else:
            out_file = out_path
        process_single(in_path, out_file, processor)
        return 0

if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
