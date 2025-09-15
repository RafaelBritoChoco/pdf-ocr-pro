#!/usr/bin/env python3
"""Post-processa arquivo de texto com marcadores de footnotes.

Fluxo:
1. Lê arquivo de entrada (UTF-8).
2. Converte [[FN_REF:N]] -> {{footnotenumberN}}N{{-footnotenumberN}}
3. Converte linhas começando com [[FN_DEF:N]] em tags {{footnoteN}}...{{-footnoteN}}
4. Remove as linhas de definição do corpo e acumula em lista.
5. Anexa bloco final:

{{footnotes_section}}
{{footnote1}}...{{-footnote1}}
...
{{-footnotes_section}}

Uso:
python postprocess_footnotes.py input.txt output.txt
"""
from __future__ import annotations
import sys
import re
from pathlib import Path

REF_PATTERN = re.compile(r"\\[\\[FN_REF:(\d{1,4})]]")
DEF_LINE_PATTERN = re.compile(r"^\\[\\[FN_DEF:(\d{1,4})]]\s*(.*)$")

FOOTNOTE_SECTION_START = "{{footnotes_section}}"
FOOTNOTE_SECTION_END = "{{-footnotes_section}}"

def transform_reference(match: re.Match[str]) -> str:
    num = match.group(1)
    return f"{{{{footnotenumber{num}}}}}{num}{{{{-footnotenumber{num}}}}}"

def main() -> int:
    if len(sys.argv) < 3:
        print("Uso: python postprocess_footnotes.py <input.txt> <output.txt>", file=sys.stderr)
        return 1
    in_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    if not in_path.exists():
        print(f"Arquivo não encontrado: {in_path}", file=sys.stderr)
        return 2

    text = in_path.read_text(encoding='utf-8', errors='replace')

    lines = text.splitlines()
    body_lines: list[str] = []
    footnotes: list[tuple[int,str]] = []  # (num, content)

    for line in lines:
        def_match = DEF_LINE_PATTERN.match(line)
        if def_match:
            num = int(def_match.group(1))
            full_original_line = def_match.group(2).strip()
            # A linha original deve conter o próprio número novamente seguido do conteúdo.
            # Caso esteja duplicado (ex: "12 12 Texto"), tentamos remover a segunda ocorrência inicial.
            cleaned_content = re.sub(rf"^{num}\\s*", "", full_original_line).strip() or full_original_line
            footnotes.append((num, cleaned_content))
        else:
            # Substitui referências inline na linha
            new_line = REF_PATTERN.sub(transform_reference, line)
            body_lines.append(new_line)

    # Ordena footnotes por numérico para saída estável
    footnotes.sort(key=lambda x: x[0])

    output_parts: list[str] = []
    output_parts.append("\n".join(body_lines).rstrip())

    if footnotes:
        output_parts.append(FOOTNOTE_SECTION_START)
        for num, content in footnotes:
            # Preserva conteúdo sem alterar pontuação
            output_parts.append(f"{{{{footnote{num}}}}}{content}{{{{-footnote{num}}}}}")
        output_parts.append(FOOTNOTE_SECTION_END)

    final_text = "\n\n".join(part for part in output_parts if part)
    out_path.write_text(final_text + "\n", encoding='utf-8')
    print(f"Processado. Footnotes: {len(footnotes)} | Saída: {out_path}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
