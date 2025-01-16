import { NextResponse } from "next/server";
import connectMongoDB from "../../../../utils/mongoDB";
import LoanApplication from "../../../../models/LoanApplication";
import {
  deleteAllFromPinecone,
  upsertToPinecone,
  vectorizeText,
} from "../../../../utils/pineconeConfig";
import FileUpload from "../../../../models/FileUpload";
import Tesseract from "tesseract.js";
import PDFParser from "pdf2json";

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

// Helper function to process PDF file
async function processPdfFile(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const textChunks = await convertFileToText(buffer, file.name);

  const chunkDocuments = await Promise.all(
    textChunks.map(async (text, index) => {
      const newChunk = new FileUpload({
        fileName: file.name,
        chunkText: text,
        chunkIndex: index,
      });
      const savedChunk = await newChunk.save();

      const vector = await vectorizeText(text);
      await upsertToPinecone(savedChunk._id.toString(), vector);

      return savedChunk._id;
    })
  );

  return {
    fileName: file.name,
    chunkIds: chunkDocuments,
  };
}

export async function POST(req) {
  try {
    await connectMongoDB();

    const formData = await req.formData();

    // Process basic information
    const application = new LoanApplication({
      name: formData.get("name"),
      age: parseInt(formData.get("age")),
      creditScore: parseInt(formData.get("creditScore")),
      email: formData.get("email"),
    });

    // Process photo
    const photo = formData.get("photo");
    // Here you would typically upload the photo to a storage service
    // and save the URL. For now, we'll assume local storage
    application.photoUrl = "/uploads/" + photo.name;

    // Process payslips
    const payslipFiles = formData.getAll("payslips");
    application.documents.payslips = await Promise.all(
      payslipFiles.map((file) => processPdfFile(file))
    );

    // Process bank statements
    const bankStatementFiles = formData.getAll("bankStatements");
    application.documents.bankStatements = await Promise.all(
      bankStatementFiles.map((file) => processPdfFile(file))
    );

    // Process ID documents
    const panCard = formData.get("panCard");
    application.documents.panCard = await processPdfFile(panCard);

    const aadhaarCard = formData.get("aadhaarCard");
    application.documents.aadhaarCard = await processPdfFile(aadhaarCard);

    // Save the application
    await application.save();

    return NextResponse.json({
      success: true,
      message: "Application submitted successfully",
      applicationId: application._id,
    });
  } catch (error) {
    console.error("Error processing loan application:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process application",
      },
      { status: 500 }
    );
  }
}
