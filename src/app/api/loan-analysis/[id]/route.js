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

function validateAnalysis(analysis) {
  // Validate all required fields are present
  const requiredFields = {
    personalInfo: ["name", "age", "creditScore"],
    incomeAnalysis: [
      "monthlyIncome",
      "annualIncome",
      "incomeStability",
      "averageMonthlyIncome",
    ],
    creditAnalysis: ["creditScore", "creditHistory", "creditRisk"],
    loanEligibility: [
      "isEligible",
      "maxLoanAmount",
      "recommendedLoanAmount",
      "riskLevel",
      "reasonForDecision",
      "suggestedInterestRate",
    ],
    documentVerification: [
      "payslipsVerified",
      "bankStatementsVerified",
      "identityDocumentsVerified",
    ],
  };

  for (const [section, fields] of Object.entries(requiredFields)) {
    for (const field of fields) {
      if (
        analysis[section][field] === undefined ||
        analysis[section][field] === null
      ) {
        throw new Error(`Missing required field: ${section}.${field}`);
      }
    }
  }

  // Validate numeric values
  if (analysis.incomeAnalysis.monthlyIncome <= 0)
    throw new Error("Monthly income must be greater than 0");
  if (
    analysis.incomeAnalysis.annualIncome !==
    analysis.incomeAnalysis.monthlyIncome * 12
  ) {
    throw new Error("Annual income must be 12 times monthly income");
  }
  if (
    analysis.loanEligibility.recommendedLoanAmount >
    analysis.loanEligibility.maxLoanAmount
  ) {
    throw new Error(
      "Recommended loan amount cannot exceed maximum loan amount"
    );
  }
  if (
    analysis.loanEligibility.suggestedInterestRate < 8 ||
    analysis.loanEligibility.suggestedInterestRate > 24
  ) {
    throw new Error("Interest rate must be between 8% and 24%");
  }

  // Validate document verification (no pending status)
  const verificationFields = [
    "payslipsVerified",
    "bankStatementsVerified",
    "identityDocumentsVerified",
  ];
  for (const field of verificationFields) {
    if (typeof analysis.documentVerification[field] !== "boolean") {
      throw new Error(`Document verification status must be boolean: ${field}`);
    }
  }

  return true;
}

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
      content: `You are an expert financial analyst AI specialized in loan assessment. You MUST provide complete analysis with NO missing values and MUST verify all documents.

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

    IMPORTANT INSTRUCTIONS:
    1. You MUST verify all documents and set verification status as true if document content is available.
    2. All numeric fields MUST have valid numbers - no nulls or undefined values allowed.
    3. All monthly and annual income calculations MUST be precise based on payslip data.
    4. If income data is available, use it to calculate exact values; if not, mark as ineligible.
    5. Credit risk assessment MUST be thorough with detailed history and clear risk level.
    6. NEVER return "pending" verification status - documents are either verified (true) or not verified (false).
    7. All amounts MUST be provided in INR with no decimal places.
    8. Interest rates MUST be between 8% to 24% based on risk assessment.

    Validation Requirements:
    - monthlyIncome > 0
    - annualIncome = monthlyIncome * 12
    - maxLoanAmount = monthlyIncome * 50 (if eligible)
    - recommendedLoanAmount ≤ maxLoanAmount
    - suggestedInterestRate must be between 8 and 24
    - All boolean flags must be explicitly set
    
    Return a complete analysis with no missing or invalid values.`,
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

    // Validate analysis before saving
    validateAnalysis(analysisResult);

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
