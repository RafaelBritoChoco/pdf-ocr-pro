import inspect
import sys
import json

try:
    import docling
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    info = {
        'docling_version': getattr(docling, '__version__', 'unknown'),
        'DocumentConverter.__init__': str(inspect.signature(DocumentConverter.__init__)),
        'PdfFormatOption.__init__': str(inspect.signature(PdfFormatOption.__init__)),
        'PdfPipelineOptions.__init__': str(inspect.signature(PdfPipelineOptions.__init__)),
    }
    print(json.dumps(info, indent=2))
except Exception as e:
    print('INSPECT_ERROR:', e)
    sys.exit(1)
