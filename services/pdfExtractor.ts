import * as pdfjs from 'pdfjs-dist';

// Set the worker URL for pdf.js. This is required for it to work in a browser environment
// without a bundler that handles web workers. We are using a CDN for this.
const PDF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

/**
 * Quickly reads a PDF file to get the total number of pages.
 * @param file The PDF file.
 * @returns A promise that resolves with the number of pages.
 */
export const getPdfPageCount = async (file: File): Promise<number> => {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const pdfDocument = await pdfjs.getDocument(arrayBuffer).promise;
    return pdfDocument.numPages;
  } catch (error) {
    console.error("Could not read PDF for page count:", error);
    return 0; // Return 0 if the PDF is unreadable
  }
};


/**
 * Extracts text content from a PDF file using pdf.js.
 * This function runs entirely in the browser, ensuring user privacy.
 * @param file The PDF file to process.
 * @param onProgress A callback function to report extraction progress (0-100).
 * @returns A promise that resolves with the extracted text content.
 */
export const extractTextFromFile = async (
  file: File,
  onProgress: (progress: number) => void
): Promise<string> => {
  console.log(`Starting real text extraction for: ${file.name}`);
  onProgress(0);

  const arrayBuffer = await file.arrayBuffer();
  
  // Load the PDF document
  const pdfDocument = await pdfjs.getDocument(arrayBuffer).promise;
  const numPages = pdfDocument.numPages;
  let fullText = '';

  // Iterate through each page and extract text
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent({ normalizeWhitespace: false } as any);

    // Position-aware reconstruction: build lines and words based on item x/y and spacing.
    // This greatly reduces spurious spaces that break inline numbers (e.g., Article 12.1) or footnote markers.
    interface TextItemLike { str: string; transform: number[]; width?: number; height?: number; }
    const items = textContent.items.filter((it: any) => 'str' in it) as TextItemLike[];

    let lines: string[] = [];
    let current = '';
    let lastX = 0, lastY = 0, lastW = 0;
    const lineYTol = 2.5; // y change considered a new line
    const minSpaceGap = 0.25; // fraction of lastW to consider as a space
    const superscripts = /[⁰ⁱ¹²³⁴⁵⁶⁷⁸⁹]/;
    const isPageNumberLine = (line: string): boolean => {
      const t = (line || '').trim();
      if (!t) return false;
      if (/^(Página|Page)\s+\d{1,4}(?:\s+(?:of|de)\s+\d{1,4})?$/i.test(t)) return true;
      if (/^\d{1,4}$/.test(t)) return true;
      return false;
    };

    const shouldSpace = (prevChar: string, nextStr: string, gap: number, lastWidth: number) => {
      if (!nextStr) return false;
      const nextChar = nextStr[0];
      // Never add space before superscript digits; keep them glued to the word.
      if (superscripts.test(nextChar)) return false;
      // No space before closing punctuation or dot-number pattern
      if (/^[\.,;:\)\]\}\!\?]/.test(nextChar)) return false;
      // Require a significant gap to insert space
      return gap > Math.max(1, lastWidth * minSpaceGap);
    };

    for (const it of items) {
      const x = it.transform?.[4] ?? lastX;
      const y = it.transform?.[5] ?? lastY;
      const w = (it.width ?? 0);
      const str = it.str || '';
      if (!str) continue;

      // New line if large Y difference upwards/downwards
      const isNewLine = current && Math.abs(y - lastY) > lineYTol && x <= lastX + 1;
      if (isNewLine) {
        lines.push(current);
        current = '';
        lastX = 0; lastW = 0;
      }

      // Space decision based on x-gap
      const gap = current ? (x - (lastX + lastW)) : 0;
      const prevChar = current ? current[current.length - 1] : '';
      if (current && shouldSpace(prevChar, str, gap, lastW)) {
        current += ' ';
      }

      // Merge content; avoid double spaces around quotes introduced by PDFs
      current += str;
      lastX = x; lastY = y; lastW = w || (str.length ? str.length * 0.5 : 5);
    }
    if (current) lines.push(current);

    // Always remove only page-number-only lines (preserve all other content).
    lines = lines.filter(l => !isPageNumberLine(l));

    // Always preserve punctuation/spaces as extracted; no post-formatting fixes here.
    const pageText = lines.join('\n');

    fullText += pageText + '\n\n';

    // Report progress after each page is processed
    const progress = Math.round((i / numPages) * 100);
    onProgress(progress);
  }

  console.log(`Finished text extraction for: ${file.name}`);
  if (!fullText.trim()) {
    return "No text could be extracted from this PDF. It might be an image-only PDF, which requires an OCR process not available in this client-side version.";
  }
  return fullText.trim();
};