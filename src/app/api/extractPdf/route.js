import { NextResponse } from "next/server";
import OpenAI from "openai";
import connectMongoDB from "../../../../utils/mongoDB";
import { searchInPinecone } from "../../../../utils/pineconeConfig";
import FileUpload from "../../../../models/FileUpload";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to vectorize the query text
async function vectorizeQuery(query) {
  const response = await openAi.embeddings.create({
    model: "text-embedding-ada-002", // Adjust the model as per your requirements
    input: query,
    encoding_format: "float", // Ensure the format matches what Pinecone expects
  });
  // Extract and return the embedding vector
  return response.data[0].embedding;
}

export async function POST(req) {
  try {
    const { query } = await req.json();

    // Connect to MongoDB
    await connectMongoDB();

    // Vectorize the search query
    const queryVector = await vectorizeQuery(query);

    // Search in Pinecone
    const searchResults = await searchInPinecone(queryVector);

    // Get the ids from the search results
    const ids = searchResults.map((result) => result.id);

    // Fetch the files (now chunks) from MongoDB using the ids
    const chunks = await FileUpload.find({
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    }).exec();

    // Construct an array of content from the chunks
    const contentFromChunks = chunks.map((chunk, index) => ({
      fileName: chunk.fileName,
      chunkText: chunk.chunkText,
      chunkIndex: chunk.chunkIndex,
    }));

    // Sort the chunks by chunkIndex to maintain the order
    contentFromChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Create a combined text from sorted chunks to send to OpenAI for further processing
    const combinedText = contentFromChunks.map((c) => c.chunkText);

    const response = await openAi.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an intelligent assistant and you answer to user's questions in not more than 40 words based on the existing content " +
            "the relevant content for this query are:\n" +
            combinedText.join("\n"),
        },
        { role: "user", content: query },
      ],
      model: "gpt-4o-2024-08-06",
      temperature: 0.9,
      max_tokens: 4000,
    });

    // Return the data as a JSON response
    return NextResponse.json(response.choices[0].message);
  } catch (error) {
    console.error("PDF processing error:", error);
    return NextResponse.json(
      {
        error: error.message,
        status: "error",
      },
      { status: 500 }
    );
  }
}
