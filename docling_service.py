"""
Docling extraction microservice (FastAPI)

Run locally (Windows PowerShell):
    python -m uvicorn docling_service:app --host 127.0.0.1 --port 8008

Endpoints:
    GET  /health            -> {status: "ok"}
    GET  /version           -> Docling and service version info
    POST /extract?mode=...  -> multipart/form-data with file=<PDF>

Modes:
    - simple   : No OCR, quick reading order, best for machine-readable PDFs
    - advanced : Enables OCR and richer layout handling (OCR, tables)

Returns JSON: {"text": "...markdown...", "meta": {...}}
"""
from __future__ import annotations

import os
import tempfile
import traceback
import inspect
from typing import Literal, Dict, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Docling imports (tolerant to version differences)
from docling.document_converter import DocumentConverter
try:
    from docling.document_converter import PdfFormatOption  # type: ignore
except Exception:  # pragma: no cover
    PdfFormatOption = None  # type: ignore

try:
    from importlib.metadata import version as pkg_version
except Exception:  # pragma: no cover
    def pkg_version(_: str) -> str:
        return "unknown"

SERVICE_VERSION = "0.2.1"


class ExtractResponse(BaseModel):
    text: str
    meta: dict


app = FastAPI(title="Docling Extraction Service", version=SERVICE_VERSION)

# Allow local development origins by default
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/version")
def version():
    try:
        dl_version = pkg_version("docling")
    except Exception:
        dl_version = "unknown"
    return {"service": SERVICE_VERSION, "docling": dl_version}

def _build_format_options(mode: Literal["simple", "advanced"]):
    """Build a PdfFormatOption instance if available, compatible across Docling versions."""
    if PdfFormatOption is None:
        return None

    # Only pass kwargs that exist in this version
    try:
        sig = inspect.signature(PdfFormatOption.__init__)
        params = set(sig.parameters.keys())
    except Exception:
        params = set()

    kwargs: Dict[str, Any] = {}

    # Toggle OCR flags if present
    for k in ("do_ocr", "enable_ocr", "ocr", "use_ocr"):
        if k in params:
            kwargs[k] = (mode == "advanced")
            break

    # Table extraction/cell matching if supported
    if mode == "advanced":
        for k, val in (("extract_tables", True), ("cell_matching", True), ("do_table_structure", True)):
            if k in params:
                kwargs[k] = val

    try:
        return PdfFormatOption(**kwargs) if kwargs else PdfFormatOption()
    except Exception:
        try:
            return PdfFormatOption()
        except Exception:
            return None


def _convert_with_optional_format(converter: DocumentConverter, path: str, fmt: Any) -> Any:
    """Call converter.convert in a way that's compatible across Docling versions.

    Some versions accept a keyword 'format_options', others don't. Prefer checking the
    signature, but also guard with a broad exception fallback since some wrappers
    (e.g. pydantic validate_call) raise non-TypeError exceptions for unexpected kwargs.
    """
    try:
        sig = inspect.signature(converter.convert)
        supports_kw = 'format_options' in sig.parameters
    except Exception:
        supports_kw = False

    if fmt is not None and supports_kw:
        try:
            kwargs: dict[str, Any] = {"format_options": fmt}
            return converter.convert(path, **kwargs)
        except Exception:
            # Fallback if runtime validation still rejects the kwarg
            return converter.convert(path)
    else:
        return converter.convert(path)


@app.post("/extract", response_model=ExtractResponse)
def extract(
    file: UploadFile = File(...),
    mode: Literal["simple", "advanced"] = Query("simple"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    suffix = os.path.splitext(file.filename)[1] or ".pdf"
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file.file.read())
            tmp_path = tmp.name
        # Prepare Docling converter (don't pass pipeline_options; not supported by some versions)
        converter = DocumentConverter()
        fmt = _build_format_options(mode)
        result: Any = _convert_with_optional_format(converter, tmp_path, fmt)
        document: Any = result.document
        markdown: Any = document.export_to_markdown()
        meta: Dict[str, Any] = {
            "mode": mode,
            "pages": getattr(document, "page_count", None),
            "filename": file.filename,
        }
        return ExtractResponse(text=markdown or "", meta=meta)
    except Exception as e:
        tb = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"[sv={SERVICE_VERSION}] Docling conversion failed: {e.__class__.__name__}: {e}\n{tb}")
    finally:
        try:
            tmp = locals().get('tmp_path')
            if tmp and os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
