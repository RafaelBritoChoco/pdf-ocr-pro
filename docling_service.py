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
    - auto     : Heuristic chooses 'simple' or 'advanced' by quick scan (no heavy load)

Returns JSON: {"text": "...markdown...", "meta": {...}}
"""
from __future__ import annotations

import os
import tempfile
import traceback
import inspect
from typing import Literal, Dict, Any, List, Tuple, cast
import json
import subprocess
import sys

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
import logging
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager

# Docling imports (tolerant to version differences)
from docling.document_converter import DocumentConverter
try:
    from docling.document_converter import PdfFormatOption  # type: ignore
except Exception:  # pragma: no cover
    PdfFormatOption = None  # type: ignore

try:
    from importlib.metadata import version as pkg_version
except Exception:  # pragma: no cover
    def pkg_version(distribution_name: str) -> str:  # keep param name matching real function for typing
        return "unknown"

SERVICE_VERSION = "0.3.0"


class ExtractResponse(BaseModel):
    text: str
    meta: Dict[str, Any]


logger = logging.getLogger("docling_service")
logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app_: FastAPI):  # type: ignore[override]
    logger.info("[startup] Docling service version %s initializing", SERVICE_VERSION)
    try:
        yield
    finally:
        logger.info("[shutdown] Docling service terminating")


app = FastAPI(title="Docling Extraction Service", version=SERVICE_VERSION, lifespan=lifespan)

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

AutoMode = Literal["auto", "simple", "advanced"]

def _build_format_options(mode: Literal["simple", "advanced"]):
    """Build a PdfFormatOption instance if available, compatible across Docling versions."""
    if PdfFormatOption is None:
        return None

    # Only pass kwargs that exist in this version
    try:
        sig = inspect.signature(PdfFormatOption.__init__)  # type: ignore[attr-defined]
        params: set[str] = set(sig.parameters.keys())
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


def _worker_convert(path: str, mode: Literal["simple", "advanced"], timeout_s: int = 3600) -> Tuple[str, int | None]:
    """Run conversion in an isolated subprocess to protect the main service.

    Returns (markdown, page_count). Raises on failure/timeouts.
    Controlled by env DOCLING_WORKER_PATH and DOCLING_PYTHON; defaults to current python and scripts/docling_worker.py.
    """
    root = os.path.dirname(__file__)
    scripts_dir = os.path.join(root, "scripts") if os.path.basename(root) != "scripts" else root
    worker_path = os.getenv("DOCLING_WORKER_PATH") or os.path.join(scripts_dir, "docling_worker.py")
    py = os.getenv("DOCLING_PYTHON") or sys.executable
    cmd = [py, worker_path, "--pdf", path, "--mode", mode]
    try:
        env = os.environ.copy()
        # Force worker to avoid passing 'format_options' kwarg for maximum compatibility across Docling versions
        env.setdefault("DOCLING_WORKER_DISABLE_FORMAT_OPTIONS", "1")
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s, env=env)
    except subprocess.TimeoutExpired as te:
        raise RuntimeError(f"worker_timeout:{te}")
    if p.returncode != 0:
        err = (p.stderr or "").strip()  # Remove truncation to see full error
        stdout_content = (p.stdout or "").strip()
        logger.error("[worker_error] Worker failed with rc=%d", p.returncode)
        logger.error("[worker_error] STDERR: %s", err)
        logger.error("[worker_error] STDOUT: %s", stdout_content)
        raise RuntimeError(f"worker_failed(rc={p.returncode}): {err}")
    try:
        data = json.loads(p.stdout or "{}")
        md = str(data.get("markdown", ""))
        pc = data.get("page_count")
        return md, int(pc) if isinstance(pc, int) else None
    except Exception as je:
        raise RuntimeError(f"worker_bad_output:{je} | out={p.stdout[:200]}")


def _quick_decide_mode(pdf_path: str) -> Literal["simple", "advanced"]:
    """Very fast heuristic to decide between simple/advanced.

    Uses pypdf (lightweight) if available to read first few pages:
        - Count characters of extracted text.
        - If text length per page < threshold OR too many images -> choose advanced.
    Fallback: default to simple.
    """
    text_chars = 0
    pages = 0
    images = 0
    threshold_chars_per_page = int(os.getenv("DOCLING_AUTO_TEXT_THRESHOLD", "400"))
    try:
        from pypdf import PdfReader  # type: ignore
        reader = PdfReader(pdf_path)  # type: ignore
        reader = cast(Any, reader)
        max_pages = min(len(reader.pages), 5)  # type: ignore[arg-type]
        for i in range(max_pages):
            pg: Any = reader.pages[i]
            pages += 1
            try:
                extracted = pg.extract_text() or ""
                text_chars += len(extracted)
            except Exception:
                pass
            try:
                # images resources under /XObject with /Subtype /Image
                xobj = pg['/Resources'].get('/XObject') if pg.get('/Resources') else None  # type: ignore
                if xobj:
                    for _name, xo in xobj.items():  # type: ignore
                        try:
                            if xo.get('/Subtype') == '/Image':  # type: ignore
                                images += 1
                        except Exception:
                            continue
            except Exception:
                pass
        if pages == 0:
            return "advanced"  # empty extraction -> likely scanned
        avg = text_chars / pages if pages else 0
        # Heuristic: very low text density OR many images -> advanced
        if avg < threshold_chars_per_page or images >= pages:
            return "advanced"
        return "simple"
    except Exception:
        return "simple"


def _analyze_pdf_quick_metrics(pdf_path: str, max_pages: int = 5) -> Dict[str, Any]:
    """Return lightweight metrics used to decide if OCR is needed.

    Metrics:
        pages_sampled: int
        total_chars: int
        avg_chars_per_page: float
        images: int (rough count)
        sparse_pages: int (pages with < 40 chars)
        sparse_pct: float
    """
    metrics: Dict[str, Any] = {
        "pages_sampled": 0,
        "total_chars": 0,
        "avg_chars_per_page": 0.0,
        "images": 0,
        "sparse_pages": 0,
        "sparse_pct": 0.0,
    }
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        return metrics
    try:
        reader = PdfReader(pdf_path)  # type: ignore
        reader = cast(Any, reader)
        sample = min(len(reader.pages), max_pages)
        for i in range(sample):
            pg: Any = reader.pages[i]
            metrics["pages_sampled"] += 1
            chars_here = 0
            try:
                extracted = pg.extract_text() or ""
                chars_here = len(extracted)
                metrics["total_chars"] += chars_here
            except Exception:
                pass
            if chars_here < 40:
                metrics["sparse_pages"] += 1
            # Count images (best-effort)
            try:
                xobj = pg['/Resources'].get('/XObject') if pg.get('/Resources') else None  # type: ignore
                if xobj:
                    for _name, xo in xobj.items():  # type: ignore
                        try:
                            if xo.get('/Subtype') == '/Image':  # type: ignore
                                metrics["images"] += 1
                        except Exception:
                            continue
            except Exception:
                pass
        if metrics["pages_sampled"]:
            metrics["avg_chars_per_page"] = metrics["total_chars"] / metrics["pages_sampled"]
            metrics["sparse_pct"] = metrics["sparse_pages"] / metrics["pages_sampled"]
    except Exception:
        return metrics
    return metrics

def _needs_ocr(metrics: Dict[str, Any]) -> Tuple[bool, List[str]]:
    reasons: List[str] = []
    threshold_chars_per_page = int(os.getenv("DOCLING_AUTO_TEXT_THRESHOLD", "400"))
    sparse_limit_pct = float(os.getenv("DOCLING_SPARSE_PCT_THRESHOLD", "0.40"))
    image_ratio_trigger = float(os.getenv("DOCLING_IMAGE_RATIO_THRESHOLD", "0.9"))
    pages = metrics.get("pages_sampled", 0) or 0
    avg = metrics.get("avg_chars_per_page", 0.0) or 0.0
    sparse_pct = metrics.get("sparse_pct", 0.0) or 0.0
    images = metrics.get("images", 0) or 0
    image_ratio = (images / pages) if pages else 0.0
    if avg < threshold_chars_per_page:
        reasons.append(f"avg_chars_per_page<{threshold_chars_per_page}")
    if sparse_pct > sparse_limit_pct:
        reasons.append(f"sparse_pct>{sparse_limit_pct}")
    if image_ratio >= image_ratio_trigger and pages > 0:
        reasons.append(f"image_ratio>={image_ratio_trigger}")
    return (len(reasons) > 0, reasons)

MEMORY_ERROR_MARKERS: List[str] = [
    "arquivo de paginação",
    "paging file is too small",
    "os error 1455",
    "1455",
    "not enough memory",
    "alloc_cpu",
]

def _is_memory_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(m.lower() in msg for m in MEMORY_ERROR_MARKERS)

@app.post("/extract", response_model=ExtractResponse)
def extract(
    file: UploadFile = File(...),
    mode: AutoMode = Query("simple"),
    progressive: bool | None = Query(None, description="Ativa fluxo multi-fase: simple sem OCR -> decide OCR. Default: auto quando mode=auto"),
):
    """Extract PDF content.

    Memory constrained fallback logic:
        - If mode=advanced and a known memory OSError (Windows paging file 1455) occurs
          we retry automatically in a lighter configuration (simple mode / no tables / no OCR).
        - Set env DOCLING_DISABLE_FALLBACK=1 to disable this automatic retry.
        - Set env DOCLING_LIGHT_MODE=1 to force simple mode always (skips heavy models).
    Meta additions:
        - fallback_used: bool
        - fallback_reason: str | None
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    force_light = os.getenv("DOCLING_LIGHT_MODE", "0") not in ("0", "false", "False")
    # FORCE DOCLING ONLY - NO FALLBACKS ALLOWED!
    disable_fallback = True  # FORCE: Always disable fallback to ensure 100% Docling usage
    progressive_default = os.getenv("DOCLING_PROGRESSIVE_DEFAULT", "1") not in ("0", "false", "False")
    force_pypdf = os.getenv("DOCLING_FORCE_PYPDF", "0") not in ("0", "false", "False")

    if progressive is None:
        progressive_final = progressive_default and (mode == "auto")
    else:
        progressive_final = bool(progressive)

    original_mode = mode

    # After file written we may mutate mode if 'auto'

    suffix = os.path.splitext(file.filename)[1] or ".pdf"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file.file.read())
            tmp_path = tmp.name

        # Hard override: force PyPDF-only extraction (diagnostic/low-memory mode)
        if force_pypdf:
            try:
                from pypdf import PdfReader  # type: ignore
                rd = PdfReader(tmp_path)  # type: ignore
                parts: List[str] = []
                for pg in rd.pages:  # type: ignore
                    try:
                        txt_page = cast(Any, pg).extract_text()  # type: ignore
                        if not isinstance(txt_page, str):
                            txt_page = ""
                        parts.append(txt_page.strip())
                    except Exception:
                        continue
                simple_txt = "\n\n".join(p for p in parts if p)
                meta: Dict[str, Any] = {
                    "requested_mode": mode,
                    "mode": "simple",
                    "pages": len(parts),
                    "filename": file.filename,
                    "fallback_used": False,
                    "fallback_reason": None,
                    "service_version": SERVICE_VERSION,
                    "hard_fallback": True,
                    "hard_fallback_reason": "forced_pypdf",
                    "forced_pypdf": True,
                }
                return ExtractResponse(text=simple_txt, meta=meta)
            except Exception as e_force:
                # If even PyPDF fails, proceed to regular pipeline (will hit outer fallback if memory error)
                logger.warning("[force_pypdf] fallback failed, continuing pipeline: %s", e_force)

        # Auto-mode decision (only if not forced light yet)
        if mode == "auto":
            decided = _quick_decide_mode(tmp_path)
            mode = decided  # decided only ever 'simple' or 'advanced'
        if force_light and mode == "advanced":
            mode = "simple"

        use_subproc = os.getenv("DOCLING_SUBPROCESS_ISOLATION", "1") not in ("0", "false", "False")

        def do_convert(effective_mode: Literal["simple", "advanced"]):
            if use_subproc:
                md, pc = _worker_convert(tmp_path, effective_mode)
                # Wrap to mimic docling result minimally
                class _Doc:
                    def __init__(self, text: str, page_count: int | None):
                        self._text = text
                        self.page_count = page_count
                    def export_to_markdown(self):
                        return self._text
                class _Res:
                    def __init__(self, doc: Any):
                        self.document = doc
                return _Res(_Doc(md, pc))
            else:
                converter_local = DocumentConverter()
                fmt_local = _build_format_options(effective_mode)
                res_local: Any = _convert_with_optional_format(converter_local, tmp_path, fmt_local)
                return res_local

        fallback_used = False
        fallback_reason: str | None = None

        progressive_meta: dict[str, Any] = {}
        result: Any | None = None

        if progressive_final:
            # Fase 0: métricas rápidas
            metrics = _analyze_pdf_quick_metrics(tmp_path)
            need_ocr, reasons = _needs_ocr(metrics)
            # Fase 1: simple SEM OCR (sempre)
            try:
                phase1 = do_convert("simple")
            except Exception as e_phase1:
                if _is_memory_error(e_phase1) and not disable_fallback:
                    # Hard immediate fallback via PyPDF
                    try:
                        from pypdf import PdfReader  # type: ignore
                        rd = PdfReader(tmp_path)  # type: ignore
                        parts: List[str] = []
                        for pg in rd.pages:  # type: ignore
                            try:
                                txt_page = cast(Any, pg).extract_text()  # type: ignore
                                if not isinstance(txt_page, str):
                                    txt_page = ""
                                parts.append(txt_page.strip())
                            except Exception:
                                continue
                        simple_txt = "\n\n".join(p for p in parts if p)
                        meta: Dict[str, Any] = {
                            "requested_mode": original_mode,
                            "mode": "simple",
                            "pages": len(parts),
                            "filename": file.filename,
                            "fallback_used": True,
                            "fallback_reason": f"hard_memory_phase1:{str(e_phase1)[:120]}",
                            "service_version": SERVICE_VERSION,
                            "progressive": True,
                            "multi_phase": False,
                            "ocr_needed": False,
                            "second_phase_attempted": False,
                            "ocr_used": False,
                            "memory_fallback": True,
                            "hard_fallback": True,
                            "hard_fallback_reason": f"{e_phase1.__class__.__name__}:{str(e_phase1)[:160]}",
                        }
                        return ExtractResponse(text=simple_txt, meta=meta)
                    except Exception:
                        raise
                # Se não for erro de memória ou fallback desabilitado, propaga
                raise
            phase1_doc: Any = phase1.document
            phase1_text: Any = phase1_doc.export_to_markdown() or ""
            used_ocr_second_phase = False
            second_phase_attempted = False
            memory_fallback = False
            # Decisão OCR real: se heurística disse que precisa E não for modo forçado light
            if need_ocr and not force_light:
                second_phase_attempted = True
                try:
                    phase2 = do_convert("advanced")
                    phase2_doc: Any = phase2.document
                    phase2_text: Any = phase2_doc.export_to_markdown() or ""
                    # Critério simples: se phase2_text tem mais caracteres, substitui
                    if len(phase2_text.strip()) > len(phase1_text.strip()):
                        result = phase2
                        used_ocr_second_phase = True
                    else:
                        result = phase1  # manter simple se não acrescentou
                except Exception as e_adv:
                    if _is_memory_error(e_adv) and not disable_fallback:
                        # Mantém fase 1 e registra fallback
                        result = phase1
                        memory_fallback = True
                        fallback_used = True
                        fallback_reason = f"memory_error_adv:{str(e_adv)[:120]}"
                    else:
                        raise
            else:
                result = phase1

            progressive_meta = {
                "progressive": True,
                "multi_phase": True,
                "heuristic": metrics,
                "heuristic_reasons": reasons if need_ocr else [],
                "ocr_needed": need_ocr,
                "second_phase_attempted": second_phase_attempted,
                "ocr_used": used_ocr_second_phase,
                "memory_fallback": memory_fallback,
            }
            # Ajusta modo reportado final
            mode = "advanced" if progressive_meta.get("ocr_used") else "simple"
        else:
            # Caminho original (não progressive)
            try:
                result = do_convert(mode)
            except Exception as e_first:
                if _is_memory_error(e_first) and mode == "advanced" and not disable_fallback:
                    try:
                        result = do_convert("simple")
                        fallback_used = True
                        fallback_reason = f"memory_error:{str(e_first)[:120]}"
                        mode = "simple"
                    except Exception:
                        raise
                else:
                    raise

        if result is None:
            raise RuntimeError("Conversion produced no result")
        hard_fallback = False
        hard_fallback_reason: str | None = None
        try:
            document: Any = result.document  # type: ignore[attr-defined]
            markdown: Any = document.export_to_markdown()
        except Exception as export_err:
            if _is_memory_error(export_err):
                # Hard fallback: pypdf only
                try:
                    from pypdf import PdfReader  # type: ignore
                    rd = PdfReader(tmp_path)  # type: ignore
                    pages_txt: List[str] = []
                    for pg in rd.pages:  # type: ignore
                        try:
                            txt_page = cast(Any, pg).extract_text()  # type: ignore
                            if not isinstance(txt_page, str):
                                txt_page = ""
                            pages_txt.append(txt_page.strip())
                        except Exception:
                            continue
                    markdown = "\n\n".join(p for p in pages_txt if p)
                    hard_fallback = True
                    hard_fallback_reason = f"export_memory_error:{str(export_err)[:120]}"
                    document = type("Obj", (), {"page_count": len(pages_txt)})()  # minimal stub
                except Exception:
                    raise
            else:
                raise
        meta: Dict[str, Any] = {
            "requested_mode": original_mode,
            "mode": mode,
            "pages": getattr(document, "page_count", None),
            "filename": file.filename,
            "fallback_used": fallback_used,
            "fallback_reason": fallback_reason,
            "service_version": SERVICE_VERSION,
            "auto_threshold_chars_per_page": os.getenv("DOCLING_AUTO_TEXT_THRESHOLD", "400") if original_mode == "auto" else None,
            **progressive_meta,
            "hard_fallback": hard_fallback,
            "hard_fallback_reason": hard_fallback_reason,
        }
        return ExtractResponse(text=(markdown or ""), meta=meta)
    except Exception as e:
        # Pipeline-wide memory fallback (before raising 500)
        if _is_memory_error(e) and not disable_fallback and tmp_path:
            try:
                from pypdf import PdfReader  # type: ignore
                rd = PdfReader(tmp_path)  # type: ignore
                parts: List[str] = []
                for pg in rd.pages:  # type: ignore
                    try:
                        txt_page = cast(Any, pg).extract_text()  # type: ignore
                        if not isinstance(txt_page, str):
                            txt_page = ""
                        parts.append(txt_page.strip())
                    except Exception:
                        continue
                simple_txt = "\n\n".join(p for p in parts if p)
                meta: Dict[str, Any] = {
                    "requested_mode": original_mode,
                    "mode": "simple",
                    "pages": len(parts),
                    "filename": file.filename,
                    "fallback_used": True,
                    "fallback_reason": f"hard_memory_pipeline:{str(e)[:120]}",
                    "service_version": SERVICE_VERSION,
                    "hard_fallback": True,
                    "hard_fallback_reason": f"{e.__class__.__name__}:{str(e)[:160]}",
                }
                return ExtractResponse(text=simple_txt, meta=meta)
            except Exception:
                pass
        tb = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"[sv={SERVICE_VERSION}] Docling conversion failed: {e.__class__.__name__}: {e}\n{tb}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
