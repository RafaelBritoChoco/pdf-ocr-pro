"""
Test minimal PDF extraction without heavy Docling models
"""
import sys
import json

def main():
    try:
        # Simple test output
        result = {
            "markdown": "# Test PDF Content\n\nThis is a minimal test extraction.",
            "page_count": 1
        }
        
        # Use UTF-8 output to avoid encoding issues
        json_output = json.dumps(result, ensure_ascii=False)
        sys.stdout.buffer.write(json_output.encode('utf-8'))
        sys.stdout.buffer.flush()
        return 0
        
    except Exception as e:
        import traceback
        error_data = {
            "error": f"test-worker-failed: {e.__class__.__name__}: {e}",
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_data), file=sys.stderr)
        return 2

if __name__ == "__main__":
    sys.exit(main())