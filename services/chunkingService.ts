/**
 * Splits a long text into smaller chunks while respecting paragraph boundaries.
 * It groups whole paragraphs together until a target chunk size is approached,
 * ensuring that chunks don't end in the middle of a sentence or tag.
 * @param text The full text to be chunked.
 * @param targetSize The desired approximate size of each chunk in characters.
 * @returns An array of text chunks.
 */
export const createChunks = (text: string, targetSize: number): string[] => {
  // If the text is small enough, no need to chunk it.
  if (text.length <= targetSize) {
    return [text];
  }

  // Split the text into paragraphs. The separator is two newlines.
  const paragraphs = text.split('\n\n');
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If adding the next paragraph (plus a separator) would exceed the target size,
    // and the current chunk is not empty, push the current chunk to the array.
    if (currentChunk.length + paragraph.length + 2 > targetSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = ""; // Start a new chunk
    }
    
    // If the current chunk is empty and the paragraph itself is larger than the target,
    // push the large paragraph as its own chunk.
    if (currentChunk.length === 0 && paragraph.length > targetSize) {
        chunks.push(paragraph);
        continue; // Move to the next paragraph
    }

    // Add the paragraph to the current chunk.
    // Prepend with '\n\n' if it's not the first paragraph in the chunk.
    if (currentChunk.length > 0) {
      currentChunk += '\n\n' + paragraph;
    } else {
      currentChunk += paragraph;
    }
  }

  // Add the last remaining chunk to the array if it's not empty.
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
};

/**
 * Splits a long text into a specific number of chunks.
 * It calculates the ideal target size and then uses the paragraph-aware
 * createChunks logic to generate a list of chunks close to the desired count.
 * @param text The full text to be chunked.
 * @param chunkCount The desired number of chunks.
 * @returns An array of text chunks.
 */
export const createChunksByCount = (text: string, chunkCount: number): string[] => {
  if (chunkCount <= 1) {
    return [text];
  }
  // Calculate the ideal size for each chunk to meet the desired count.
  const targetSize = Math.ceil(text.length / chunkCount);
  // Use the original, paragraph-aware chunking function with the calculated size.
  return createChunks(text, targetSize);
};