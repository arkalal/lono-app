import { NextResponse } from "next/server";
import OpenAI from "openai";
import pdf from "pdf-parse";
import { v4 as uuidv4 } from "uuid";
import {
  createEmbedding,
  storeInPinecone,
} from "../../../../utils/pinecone-client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function chunkText(text, chunkSize = 1000) {
  const chunks = [];
  const sentences = text.split(/[.!?]+\s+/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const pdfFile = formData.get("pdf");

    if (!pdfFile) {
      return NextResponse.json(
        { error: "No PDF file provided" },
        { status: 400 }
      );
    }

    // Convert file to buffer and extract text
    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const { text } = await pdf(buffer);

    // Split into chunks
    const chunks = chunkText(text);
    const documentId = uuidv4();

    let allAnalysis = [];

    // Process each chunk
    for (const [index, chunk] of chunks.entries()) {
      try {
        // Create embedding
        const embedding = await createEmbedding(openai, chunk);

        // Store in Pinecone
        await storeInPinecone(`${documentId}-${index}`, chunk, embedding);

        // Analyze with GPT-4
        const analysis = await openai.chat.completions.create({
          model: "gpt-4o-2024-08-06",
          messages: [
            {
              role: "system",
              content: "Extract key information from this text segment.",
            },
            {
              role: "user",
              content: chunk,
            },
          ],
          max_tokens: 500,
        });

        console.log("analysis", analysis);

        allAnalysis.push(analysis.choices[0].message.content);
      } catch (error) {
        console.error(`Error processing chunk ${index}:`, error);
      }
    }

    // Combine analyses
    const finalSummary = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content:
            "Create a structured summary of the analyzed document segments.",
        },
        {
          role: "user",
          content: allAnalysis.join("\n\n"),
        },
      ],
      max_tokens: 1000,
    });

    console.log("finalSummary", finalSummary);

    return new NextResponse(
      JSON.stringify({
        text: finalSummary.choices[0].message.content,
        documentId,
        status: "success",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("PDF processing error:", error);
    return new NextResponse(
      JSON.stringify({
        error: "Failed to process PDF",
        details: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
