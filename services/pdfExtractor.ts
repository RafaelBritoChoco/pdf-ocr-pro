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
    const textContent = await page.getTextContent();
    
    // Join the text items on the page
    const pageText = textContent.items.map(item => {
      // The item can be a TextItem object which has a 'str' property.
      // We need a type guard here to make TypeScript happy.
      if ('str' in item) {
        return item.str;
      }
      return '';
    }).join(' ');
    
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