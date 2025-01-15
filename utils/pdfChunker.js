export function splitIntoChunks(text, chunkSize = 1000) {
  const chunks = [];
  const sentences = text.split(/[.!?]+/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if (
      (currentChunk + sentence).length > chunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    currentChunk += sentence + ". ";
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
