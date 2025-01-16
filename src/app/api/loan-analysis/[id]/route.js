// app/api/loan-analysis/[id]/route.js

import { NextResponse } from "next/server";
import OpenAI from "openai";
import connectMongoDB from "../../../../../utils/mongoDB";
import LoanApplication from "../../../../../models/LoanApplication";
import FileUpload from "../../../../../models/FileUpload";
import LoanAnalysis from "../../../../../models/LoanAnalysis";
import {
  deleteFromPinecone,
  searchInPinecone,
  vectorizeText,
} from "../../../../../utils/pineconeConfig";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getRelevantDocuments(query) {
  // Vectorize the query
  const queryVector = await vectorizeText(query);

  // Search in Pinecone
  const searchResults = await searchInPinecone(queryVector);

  // Get the ids from search results
  const ids = searchResults.map((result) => result.id);

  // Fetch documents from MongoDB
  const chunks = await FileUpload.find({
    _id: { $in: ids },
  }).exec();

  // Sort and combine text
  return chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => chunk.chunkText)
    .join("\n");
}

export async function POST(req) {
  try {
    await connectMongoDB();

    // Get params from request URL
    const url = req.url;
    const id = url.split("/").pop(); // Extract ID from URL

    if (!id) {
      return NextResponse.json(
        { error: "ID parameter is required" },
        { status: 400 }
      );
    }

    const application = await LoanApplication.findById(id);
    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Get relevant document content using semantic search
    const incomeQuery = "monthly income salary earnings pay";
    const creditQuery = "credit history payments loans debt";
    const identityQuery = "identification verification identity proof";

    const [incomeContent, creditContent, identityContent] = await Promise.all([
      getRelevantDocuments(incomeQuery),
      getRelevantDocuments(creditQuery),
      getRelevantDocuments(identityQuery),
    ]);

    const analysisPrompt = {
      role: "developer",
      content: `You are an expert financial analyst AI specialized in loan assessment. Analyze this loan application data and provide a structured analysis.
    
    Applicant Profile:
    - Name: ${application.name}
    - Age: ${application.age}
    - Credit Score: ${application.creditScore}
    
    Income Documents Analysis:
    ${incomeContent}

    Credit Profile Analysis:
    ${creditContent}

    Identity Verification Records:
    ${identityContent}

    Provide a strict JSON output following the schema with:
    1. Accurate monthly and annual income calculations from payslips
    2. Income stability assessment based on bank statements
    3. Credit risk evaluation considering the credit score and history
    4. Maximum loan eligibility (typically 50x monthly income for good credit)
    5. Document verification flags based on completeness and consistency
    
    Be conservative in assessments and flag any inconsistencies.`,
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        analysisPrompt,
        {
          role: "user",
          content: "Analyze this application and provide the JSON response.",
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "loan_analysis_schema",
          schema: {
            type: "object",
            properties: {
              personalInfo: {
                type: "object",
                description: "Basic information about the loan applicant",
                properties: {
                  name: {
                    type: "string",
                    description: "Full name of the applicant",
                  },
                  age: { type: "number", description: "Age of the applicant" },
                  creditScore: {
                    type: "number",
                    description: "Credit score of the applicant",
                  },
                  photoUrl: {
                    type: "string",
                    description: "URL to applicant's photo",
                  },
                },
              },
              incomeAnalysis: {
                type: "object",
                description: "Analysis of applicant's income and stability",
                properties: {
                  monthlyIncome: {
                    type: "number",
                    description: "Average monthly income in INR",
                  },
                  annualIncome: {
                    type: "number",
                    description: "Total annual income in INR",
                  },
                  incomeStability: {
                    type: "string",
                    description: "Assessment of income stability",
                  },
                  averageMonthlyIncome: {
                    type: "number",
                    description: "Average income over last 3 months",
                  },
                },
              },
              creditAnalysis: {
                type: "object",
                description: "Analysis of applicant's credit history",
                properties: {
                  creditScore: {
                    type: "number",
                    description: "Current credit score",
                  },
                  creditHistory: {
                    type: "string",
                    description: "Summary of credit history",
                  },
                  creditRisk: {
                    type: "string",
                    description: "Assessment of credit risk level",
                  },
                },
              },
              loanEligibility: {
                type: "object",
                description: "Loan eligibility assessment and recommendations",
                properties: {
                  isEligible: {
                    type: "boolean",
                    description: "Whether applicant is eligible for loan",
                  },
                  maxLoanAmount: {
                    type: "number",
                    description: "Maximum loan amount eligible for",
                  },
                  recommendedLoanAmount: {
                    type: "number",
                    description: "Recommended loan amount",
                  },
                  riskLevel: {
                    type: "string",
                    description: "Overall risk assessment",
                  },
                  reasonForDecision: {
                    type: "string",
                    description: "Explanation for eligibility decision",
                  },
                  suggestedInterestRate: {
                    type: "number",
                    description: "Suggested interest rate percentage",
                  },
                },
              },
              documentVerification: {
                type: "object",
                description: "Status of document verification",
                properties: {
                  payslipsVerified: {
                    type: "boolean",
                    description: "Whether payslips are verified",
                  },
                  bankStatementsVerified: {
                    type: "boolean",
                    description: "Whether bank statements are verified",
                  },
                  identityDocumentsVerified: {
                    type: "boolean",
                    description: "Whether identity documents are verified",
                  },
                },
              },
            },
            required: [
              "personalInfo",
              "incomeAnalysis",
              "creditAnalysis",
              "loanEligibility",
              "documentVerification",
            ],
            additionalProperties: false,
          },
        },
      },
      temperature: 0.7,
      max_tokens: 4000,
    });

    const analysisResult = JSON.parse(response.choices[0].message.content);

    // Create LoanAnalysis record
    const analysis = new LoanAnalysis({
      applicationId: application._id,
      analysis: analysisResult,
    });
    await analysis.save();

    // Update application status
    application.status = "analyzed";
    await application.save();

    return NextResponse.json({
      success: true,
      analysis: analysisResult,
    });
  } catch (error) {
    console.error("Error in loan analysis:", error);
    return NextResponse.json(
      { error: error.message || "Analysis failed" },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    const url = req.url;
    const id = url.split("/").pop();

    if (!id) {
      return NextResponse.json(
        { error: "ID parameter is required" },
        { status: 400 }
      );
    }

    await connectMongoDB();
    const analysis = await LoanAnalysis.findOne({
      applicationId: id,
    })
      .populate("applicationId")
      .exec();

    if (!analysis) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis: analysis.analysis,
    });
  } catch (error) {
    console.error("Error fetching analysis:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch analysis" },
      { status: 500 }
    );
  }
}

// Add DELETE method for cleaning up application data
export async function DELETE(req, { params }) {
  try {
    await connectMongoDB();
    const { id } = params;

    // Find application first
    const application = await LoanApplication.findById(id);
    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Get all chunk IDs from documents
    const chunkIds = [
      ...application.documents.payslips.flatMap((doc) => doc.chunkIds),
      ...application.documents.bankStatements.flatMap((doc) => doc.chunkIds),
      ...(application.documents.panCard?.chunkIds || []),
      ...(application.documents.aadhaarCard?.chunkIds || []),
    ];

    // Delete chunks and vectors
    await Promise.all(
      chunkIds.map(async (chunkId) => {
        try {
          await FileUpload.findByIdAndDelete(chunkId);
          await deleteFromPinecone(chunkId.toString());
        } catch (error) {
          console.error(`Error deleting chunk ${chunkId}:`, error);
        }
      })
    );

    // Delete analysis
    await LoanAnalysis.findOneAndDelete({ applicationId: id });

    // Delete application
    await LoanApplication.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: "Application and related data deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting application:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete application" },
      { status: 500 }
    );
  }
}
