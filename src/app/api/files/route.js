import { NextResponse } from "next/server";
import {
  deleteAllFromPinecone,
  deleteFromPinecone,
  upsertToPinecone,
  vectorizeText,
} from "../../../../utils/pineconeConfig";
import Tesseract from "tesseract.js";
import PDFParser from "pdf2json";
import connectMongoDB from "../../../../utils/mongoDB";
import FileUpload from "../../../../models/FileUpload";
import LoanAnalysis from "../../../../models/LoanAnalysis";

const MAX_TOKENS = 200; // Define the max tokens for each chunk

// Utility to get the number of tokens - replace with actual token counting if necessary
const estimateTokenCount = (text) => {
  return text.split(" ").length; // Naive estimation based on words
};

// Function to chunk text into smaller parts
const chunkText = (text, maxTokens) => {
  const words = text.split(" ");
  const chunks = [];

  for (let i = 0; i < words.length; i += maxTokens) {
    chunks.push(words.slice(i, i + maxTokens).join(" "));
  }

  return chunks;
};

async function convertFileToText(buffer, fileName) {
  if (fileName.endsWith(".pdf")) {
    try {
      const pdfParser = new PDFParser();

      const text = await new Promise((resolve, reject) => {
        pdfParser.on("pdfParser_dataReady", (pdfData) => {
          const text = pdfData.Pages.map((page) =>
            page.Texts.map((text) => decodeURIComponent(text.R[0].T)).join(" ")
          ).join("\n");
          resolve(text);
        });

        pdfParser.on("pdfParser_dataError", reject);

        pdfParser.parseBuffer(buffer);
      });

      return chunkText(text, MAX_TOKENS);
    } catch (error) {
      console.error("Error parsing PDF:", error);
      throw new Error("Failed to parse PDF");
    }
  } else if (
    [".png", ".jpg", ".jpeg", ".bmp"].some((ext) => fileName.endsWith(ext))
  ) {
    // Your existing image handling code remains the same
    return new Promise((resolve, reject) => {
      Tesseract.recognize(buffer, "eng", {
        logger: (m) => console.log(m),
      })
        .then(({ data: { text } }) => resolve(text))
        .catch((error) => {
          console.error("Error with Tesseract:", error);
          reject("Failed to process image");
        });
    });
  } else {
    throw new Error("Unsupported file type");
  }
}

export async function POST(req) {
  try {
    // Connect to MongoDB first
    await connectMongoDB();

    const data = await req.formData();
    const files = data.getAll("files");

    console.log("files", files);

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const processedFiles = await Promise.all(
      files.map(async (file) => {
        try {
          // Convert file to buffer
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Get text chunks
          const textChunks = await convertFileToText(buffer, file.name);
          console.log(
            `Processing ${textChunks.length} chunks for ${file.name}`
          );

          // Process chunks
          const chunkDocuments = await Promise.all(
            textChunks.map(async (text, index) => {
              try {
                // Save to MongoDB
                const newChunk = new FileUpload({
                  fileName: file.name,
                  chunkText: text,
                  chunkIndex: index,
                });
                const savedChunk = await newChunk.save();
                console.log(`Saved chunk ${index} to MongoDB`);

                // Create and store vector
                const vector = await vectorizeText(text);
                await upsertToPinecone(savedChunk._id.toString(), vector);
                console.log(`Stored vector for chunk ${index} in Pinecone`);

                return savedChunk;
              } catch (chunkError) {
                console.error(`Error processing chunk ${index}:`, chunkError);
                throw chunkError;
              }
            })
          );

          return {
            fileName: file.name,
            chunks: chunkDocuments.map((doc) => doc._id),
          };
        } catch (fileError) {
          console.error(`Error processing file ${file.name}:`, fileError);
          throw fileError;
        }
      })
    );

    return NextResponse.json({
      success: true,
      message: "Files processed successfully",
      files: processedFiles,
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process files",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // await connectMongoDB();
  // const saveFiles = await FileUpload.find();
  return NextResponse.json({ message: "just testing" }, { status: 200 });
}

export async function DELETE(req) {
  try {
    await connectMongoDB();

    // Delete all documents from MongoDB
    const deleteResult = await FileUpload.deleteMany({});
    const deleteAnalysis = await LoanAnalysis.deleteMany({});
    console.log("Deleted from MongoDB:", deleteResult);

    // Delete all vectors from Pinecone
    await deleteAllFromPinecone();

    return NextResponse.json(
      {
        message: "All data deleted successfully",
        mongoResult: deleteResult,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting data:", error);
    return NextResponse.json(
      {
        error: "Failed to delete data",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
