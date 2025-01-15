import { NextResponse } from "next/server";
import FileUpload from "../../../../models/FileUpload";
import connectMongoDB from "../../../../utils/mongoDB";
import {
  deleteFromPinecone,
  upsertToPinecone,
  vectorizeText,
} from "../../../../utils/pineconeConfig";
import pdfParse from "pdf-parse";
import Tesseract from "tesseract.js";

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
  // Handle PDF file conversion to text
  if (fileName.endsWith(".pdf")) {
    try {
      const data = await pdfParse(buffer);
      return chunkText(data.text, MAX_TOKENS); // Chunk the text before returning
    } catch (error) {
      console.error("Error parsing PDF:", error);
      throw new Error("Failed to parse PDF");
    }
    // Handle image file conversion to text
  } else if (
    [".png", ".jpg", ".jpeg", ".bmp"].some((ext) => fileName.endsWith(ext))
  ) {
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
    await connectMongoDB();
    const data = await req.formData();
    const files = data.getAll("files");

    const processedFiles = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const textChunks = await convertFileToText(buffer, file.name); // This will now return chunks of text

        // Process each chunk
        const chunkDocuments = await Promise.all(
          textChunks.map(async (text, index) => {
            // Store the chunk in MongoDB
            const newChunk = new FileUpload({
              fileName: file.name,
              chunkText: text,
              chunkIndex: index,
            });
            const savedChunk = await newChunk.save();

            // Vectorize and store in Pinecone
            const vector = await vectorizeText(text);
            await upsertToPinecone(savedChunk._id.toString(), vector);

            return savedChunk; // Return the saved chunk information
          })
        );

        // Return information about all chunks for this file
        return {
          fileName: file.name,
          chunks: chunkDocuments.map((doc) => doc._id),
        };
      })
    );

    return NextResponse.json(
      {
        message: "All files and chunks processed successfully",
        files: processedFiles,
      },
      { status: 200 }
    );
  } catch (error) {
    console.log("Error:", error);
    return NextResponse.json(
      { message: "Error saving files" },
      { status: 500 }
    );
  }
}

export async function GET() {
  await connectMongoDB();
  const saveFiles = await FileUpload.find();
  return NextResponse.json(saveFiles);
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get("id");
  await connectMongoDB();
  await FileUpload.findByIdAndDelete(id);
  // await deleteFromPinecone(id);

  return NextResponse.json({ message: "file deleted" }, { status: 200 });
}
