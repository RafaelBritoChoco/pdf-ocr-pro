"""
Lightweight Docling worker process.

Usage:
  python scripts/docling_worker.py --pdf <path> --mode simple|advanced

Outputs JSON to stdout:
  {"markdown": "...", "page_count": <int>}

This script intentionally contains minimal logic to avoid extra memory
fragmentation in the parent process. The parent service decides any
progressive/heuristic behavior and just calls this worker per phase.
"""
from __future__ import annotations

import argparse
import json
import sys
import os
from typing import Any, Dict, cast
from inspect import signature

try:
    from docling.document_converter import DocumentConverter
    try:
        from docling.document_converter import PdfFormatOption  # type: ignore
    except Exception:
        PdfFormatOption = None  # type: ignore
except Exception as e:
    print(json.dumps({"error": f"docling import failed: {e}"}), file=sys.stderr)
    sys.exit(2)


def detect_gpu_device():
    """Detect and configure GPU device for Docling acceleration."""
    try:
        import torch
    except ImportError:
        print("[GPU] PyTorch not available, using CPU", file=sys.stderr)
        return "cpu"
    
    # Check for CUDA
    if torch.cuda.is_available():
        device = "cuda"
        try:
            gpu_name = torch.cuda.get_device_name(0)
            gpu_props = torch.cuda.get_device_properties(0)
            gpu_memory = getattr(gpu_props, 'total_memory', 0) / (1024**3)  # GB
            print(f"[GPU] Using CUDA: {gpu_name} ({gpu_memory:.1f}GB VRAM)", file=sys.stderr)
        except Exception:
            print("[GPU] Using CUDA (device info unavailable)", file=sys.stderr)
        
        # Set optimal CUDA settings for document processing
        try:
            torch.cuda.empty_cache()  # Clear any existing cache
            torch.backends.cudnn.benchmark = True  # Optimize for consistent input sizes
        except Exception:
            pass
        
        return device
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = "mps"  # Apple Silicon GPU
        print("[GPU] Using Apple MPS acceleration", file=sys.stderr)
        return device
    else:
        # Even without CUDA, we can still optimize CPU usage
        print("[CPU] Using optimized CPU processing (GPU acceleration unavailable)", file=sys.stderr)
        
        # Optimize CPU performance
        try:
            import os
            # Use all available CPU cores for PyTorch
            cpu_count = os.cpu_count() or 4  # Default to 4 if None
            torch.set_num_threads(cpu_count)
            print(f"[CPU] Configured to use {cpu_count} CPU threads", file=sys.stderr)
        except Exception:
            pass
            
        return "cpu"


def create_gpu_optimized_converter():
    """Create DocumentConverter with lightweight PyPdfiumDocumentBackend to avoid memory issues."""
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.base_models import InputFormat
    from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend
    
    try:
        print("[DOCLING-LIGHTWEIGHT] Creating DocumentConverter with PyPdfiumDocumentBackend", file=sys.stderr)
        
        # Create pipeline options for raw text extraction without structure modifications
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = False                    # Disable OCR completely
        pipeline_options.do_table_structure = False       # Disable table structure model
        pipeline_options.generate_page_images = False     # Disable page image generation
        pipeline_options.generate_picture_images = False  # Disable picture image generation
        pipeline_options.generate_table_images = False    # Disable table image generation
        
        # Create format options that use the lightweight PyPdfium backend class (not instance)
        format_options = {
            InputFormat.PDF: PdfFormatOption(
                pipeline_options=pipeline_options,
                backend=PyPdfiumDocumentBackend  # Pass the class, not instance
            )
        }
        
        # Create converter with lightweight backend
        converter = DocumentConverter(format_options=format_options)
        
        print("[DOCLING-LIGHTWEIGHT] DocumentConverter created successfully with PyPdfiumDocumentBackend", file=sys.stderr)
        return converter
        
    except Exception as e:
        print(f"[DOCLING-LIGHTWEIGHT] Error creating converter: {e}", file=sys.stderr)
        print("[DOCLING-LIGHTWEIGHT] Falling back to basic DocumentConverter", file=sys.stderr)
        return DocumentConverter()


def build_format_options(mode: str):
    """Build format options with memory-efficient settings."""
    if PdfFormatOption is None:
        return None
        
    print(f"[FORMAT] Building lightweight format options (mode: {mode})", file=sys.stderr)
    
    try:
        params = set(signature(PdfFormatOption.__init__).parameters.keys())  # type: ignore[attr-defined]
    except Exception:
        params: set[str] = set()
    
    kwargs: Dict[str, Any] = {}
    
    # FORCE LIGHTWEIGHT MODE - disable ALL memory-heavy features regardless of requested mode
    print("[FORMAT] Forcing lightweight mode to prevent memory errors", file=sys.stderr)
    
    # Disable OCR (memory intensive)
    for k in ("do_ocr", "enable_ocr", "ocr", "use_ocr"):
        if k in params:
            kwargs[k] = False  # Always False!
            print(f"[FORMAT] Disabled {k}", file=sys.stderr)
            break
    
    # Disable table processing (very memory intensive!)
    for k, v in (("extract_tables", False), ("cell_matching", False), ("do_table_structure", False)):
        if k in params:
            kwargs[k] = v
            print(f"[FORMAT] Disabled {k}", file=sys.stderr)
    
    try:
        if kwargs:
            return PdfFormatOption(**kwargs)  # type: ignore
        else:
            return PdfFormatOption()  # type: ignore
    except Exception as e:
        print(f"[FORMAT] Warning creating PdfFormatOption: {e}", file=sys.stderr)
        try:
            return PdfFormatOption()  # type: ignore
        except Exception:
            return None


def convert_with_optional_format(conv: DocumentConverter, pdf_path: str, fmt: Any | None) -> Any:
    """Call convert() using 'format_options' only if supported; otherwise fallback.

    Some Docling builds wrap convert() with pydantic and will raise ValidationError
    instead of TypeError on unexpected kwargs. We both check the signature and
    also guard with a broad exception fallback to be safe.
    """
    # Signature probe
    supports_kw = False
    try:
        sig = signature(conv.convert)
        supports_kw = ('format_options' in sig.parameters)
    except Exception:
        supports_kw = False

    if fmt is not None and supports_kw:
        try:
            return conv.convert(pdf_path, format_options=fmt)  # type: ignore[arg-type]
        except Exception:
            # Fallback if runtime validator rejects the kwarg
            return conv.convert(pdf_path)
    else:
        return conv.convert(pdf_path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--mode", choices=["simple", "advanced"], required=True)
    args = ap.parse_args()

    try:
        # Use GPU-optimized converter instead of basic DocumentConverter
        conv = create_gpu_optimized_converter()
        
        # Allow parent to disable passing 'format_options' entirely for maximum compatibility
        disable_fmt = os.getenv("DOCLING_WORKER_DISABLE_FORMAT_OPTIONS", "1") not in ("0", "false", "False")
        fmt = None if disable_fmt else build_format_options(args.mode)
        res: Any = convert_with_optional_format(conv, args.pdf, fmt)
        doc: Any = res.document  # type: ignore[attr-defined]
        
        # Extract markdown but clean up common artifacts for better AI processing
        try:
            # Get the markdown output from Docling (preserves structure for AI)
            raw_markdown: str = cast(str, doc.export_to_markdown() or "")
            print(f"[EXTRACTION] Original markdown length: {len(raw_markdown)}", file=sys.stderr)
            
            # Clean up common Docling artifacts while preserving structure for AI
            cleaned_markdown = raw_markdown
            
            # Remove excessive dashes that aren't part of original content
            import re
            cleaned_markdown = re.sub(r'-{3,}', '---', cleaned_markdown)  # Max 3 dashes for markdown separators
            cleaned_markdown = re.sub(r'(?<!\n)-(?!\n)', '', cleaned_markdown)  # Remove isolated dashes not on their own line
            
            # Clean up tab artifacts (spaces that became dashes)
            cleaned_markdown = re.sub(r'\s+-\s+', ' ', cleaned_markdown)  # Remove " - " patterns from tabs
            
            # Remove trailing whitespace and normalize line breaks
            lines = cleaned_markdown.split('\n')
            cleaned_lines = [line.rstrip() for line in lines]
            cleaned_markdown = '\n'.join(cleaned_lines)
            
            # Remove excessive blank lines (more than 2 consecutive)
            cleaned_markdown = re.sub(r'\n{3,}', '\n\n', cleaned_markdown)
            
            markdown_content = cleaned_markdown.strip()
            print(f"[EXTRACTION] Cleaned markdown length: {len(markdown_content)}", file=sys.stderr)
                
        except Exception as e:
            print(f"[EXTRACTION] Error during extraction: {e}", file=sys.stderr)
            # Fallback to basic markdown
            markdown_content = cast(str, doc.export_to_markdown() or "# Document\n\nExtraction failed.")
        
        out: Dict[str, Any] = {"markdown": markdown_content, "page_count": getattr(doc, "page_count", None)}
        
        # Force UTF-8 encoding for JSON output to handle Unicode characters
        json_output = json.dumps(out, ensure_ascii=False)
        sys.stdout.buffer.write(json_output.encode('utf-8'))
        sys.stdout.buffer.flush()
        return 0
    except SystemExit as se:
        raise se
    except Exception as e:
        # Capture full traceback for debugging
        import traceback
        tb = traceback.format_exc()
        print(json.dumps({
            "error": f"worker-failed: {e.__class__.__name__}: {e}",
            "traceback": tb
        }), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
