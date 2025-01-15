import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

// Initialize the Pinecone client with your project API key
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// Your existing index name from Pinecone
const index = pc.index(process.env.PINECONE_INDEX_NAME);

// Initialize the OpenAI client with your API key
const openAi = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to vectorize text using OpenAI embeddings
async function vectorizeText(text) {
  try {
    // Updated method signature according to your provided snippet
    const response = await openAi.embeddings.create({
      model: "text-embedding-ada-002", // Adjust the model as per your requirements
      input: text,
      encoding_format: "float", // Ensure the format matches what Pinecone expects
    });

    console.log("response", response);
    // Extract and return the embedding vector
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error in vectorizeText:", error);
    throw error; // Rethrow the error to handle it in the calling context
  }
}

// Function to upsert data into the Pinecone index
async function upsertToPinecone(id, vector) {
  // Directly upsert the data to Pinecone
  await index.upsert([{ id, values: vector }]);
}

// Function to search in the Pinecone index
async function searchInPinecone(queryVector) {
  // Perform a vector search in Pinecone
  const response = await index.query({ vector: queryVector, topK: 50 });
  return response.matches;
}

// Function to delete data from the Pinecone index
async function deleteFromPinecone(id) {
  try {
    // Assuming 'delete' is the method provided by Pinecone's client library
    const response = await index.delete({ ids: [id] });
    console.log("Delete response", response);
    return response; // response object could contain details about the deletion
  } catch (error) {
    console.error("Error in deleteFromPinecone:", error);
    throw error; // Rethrow the error to handle it in the calling context
  }
}

export {
  upsertToPinecone,
  searchInPinecone,
  vectorizeText,
  deleteFromPinecone,
};
