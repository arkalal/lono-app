import { Pinecone } from "@pinecone-database/pinecone";

if (!process.env.PINECONE_API_KEY) {
  throw new Error("Missing Pinecone API key");
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || "",
  environment: process.env.PINECONE_ENVIRONMENT || "",
});

if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error("Missing Pinecone index name");
}

export const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);

export async function createEmbedding(openai, text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function storeInPinecone(documentId, text, embedding) {
  try {
    await pineconeIndex.upsert([
      {
        id: documentId,
        values: embedding,
        metadata: {
          text,
          timestamp: new Date().toISOString(),
        },
      },
    ]);
    return true;
  } catch (error) {
    console.error("Error storing in Pinecone:", error);
    return false;
  }
}

export async function queryPinecone(embedding, topK = 5) {
  try {
    const results = await pineconeIndex.query({
      vector: embedding,
      topK,
      includeMetadata: true,
    });
    return results.matches;
  } catch (error) {
    console.error("Error querying Pinecone:", error);
    return [];
  }
}
