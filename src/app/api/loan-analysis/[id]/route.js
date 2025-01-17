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

  // Check all required fields exist
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

  // Validate exact numeric values
  const income = {
    monthly: analysis.incomeAnalysis.monthlyIncome,
    average: analysis.incomeAnalysis.averageMonthlyIncome,
    annual: analysis.incomeAnalysis.annualIncome,
  };

  // Ensure all income values are valid numbers
  if (!Number.isFinite(income.monthly) || income.monthly <= 0) {
    throw new Error("Invalid monthly income amount");
  }
  if (!Number.isFinite(income.average) || income.average <= 0) {
    throw new Error("Invalid average monthly income amount");
  }
  if (!Number.isFinite(income.annual) || income.annual <= 0) {
    throw new Error("Invalid annual income amount");
  }

  // Validate monthly to annual calculation
  const calculatedAnnual = income.monthly * 12;
  if (Math.abs(calculatedAnnual - income.annual) > 1) {
    // Allow 1 rupee difference for rounding
    throw new Error(
      `Annual income (${income.annual}) does not match monthly income * 12 (${calculatedAnnual})`
    );
  }

  // Validate average monthly income is reasonable
  if (
    income.average > income.monthly * 1.5 ||
    income.average < income.monthly * 0.5
  ) {
    throw new Error(
      `Average monthly income (${income.average}) is too far from current monthly income (${income.monthly})`
    );
  }

  // Validate loan amounts
  if (
    !analysis.loanEligibility.isEligible &&
    analysis.loanEligibility.maxLoanAmount > 0
  ) {
    throw new Error("Ineligible applicants should have 0 loan amount");
  }

  if (analysis.loanEligibility.isEligible) {
    const maxPossibleLoan = income.monthly * 50;
    if (analysis.loanEligibility.maxLoanAmount > maxPossibleLoan) {
      throw new Error(
        `Max loan amount (${analysis.loanEligibility.maxLoanAmount}) exceeds 50x monthly income (${maxPossibleLoan})`
      );
    }

    if (
      analysis.loanEligibility.recommendedLoanAmount >
      analysis.loanEligibility.maxLoanAmount
    ) {
      throw new Error(
        "Recommended loan amount cannot exceed maximum loan amount"
      );
    }

    // Ensure amounts are rounded to nearest 100
    if (
      analysis.loanEligibility.maxLoanAmount % 100 !== 0 ||
      analysis.loanEligibility.recommendedLoanAmount % 100 !== 0
    ) {
      throw new Error("Loan amounts must be rounded to nearest 100");
    }
  }

  // Validate credit score
  if (
    analysis.creditAnalysis.creditScore !== analysis.personalInfo.creditScore ||
    !Number.isFinite(analysis.creditAnalysis.creditScore) ||
    analysis.creditAnalysis.creditScore < 300 ||
    analysis.creditAnalysis.creditScore > 900
  ) {
    throw new Error("Invalid credit score");
  }

  // // Validate interest rate
  // if (
  //   !Number.isFinite(analysis.loanEligibility.suggestedInterestRate) ||
  //   analysis.loanEligibility.suggestedInterestRate < 8 ||
  //   analysis.loanEligibility.suggestedInterestRate > 24
  // ) {
  //   throw new Error("Interest rate must be between 8% and 24%");
  // }

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

  // Validate risk level
  const validRiskLevels = ["Low", "Medium", "High"];
  if (!validRiskLevels.includes(analysis.loanEligibility.riskLevel)) {
    throw new Error("Invalid risk level");
  }

  // Validate reason for decision is not empty
  if (!analysis.loanEligibility.reasonForDecision.trim()) {
    throw new Error("Reason for decision cannot be empty");
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
    const incomeQuery =
      "monthly income salary earnings pay CTC take-home gross salary slip payslip amount figure INR Rs";
    const creditQuery = "credit history payments loans debt";
    const identityQuery = "identification verification identity proof";

    const [incomeContent, creditContent, identityContent] = await Promise.all([
      getRelevantDocuments(incomeQuery),
      getRelevantDocuments(creditQuery),
      getRelevantDocuments(identityQuery),
    ]);

    const analysisPrompt = {
      role: "developer",
      content: `You are a financial analyst AI specialized in loan assessment. EXTRACT EXACT NUMBERS from the documents.

    Applicant Profile:
    - Name: ${application.name}
    - Age: ${application.age}
    - Credit Score: ${application.creditScore}
    
    STEP BY STEP ANALYSIS REQUIRED:

    1. Income Analysis:
    - First, identify ALL salary/income amounts in the payslips
    - Calculate average of last 3 months' salary EXACTLY
    - Monthly income must be the latest salary figure
    - SET averageMonthlyIncome as the 3-month average
    - Ensure monthlyIncome matches the latest payslip amount
    - Annual income MUST BE exactly 12 times the monthly income
    
    2. Document Analysis:
    - For each payslip, extract the exact amount
    - For bank statements, verify regular salary credits
    - Cross verify amounts between payslips and bank statements
    - Document is verified ONLY if amount is clearly visible and matches
    
    3. Loan Amount Calculation:
    - maxLoanAmount = monthlyIncome * 50 (if eligible)
    - recommendedLoanAmount = maxLoanAmount * 0.8
    - Amounts must be rounded to nearest 100
    
    4. Verification Rules:
    - Mark document as verified(true) ONLY if exact amounts are found
    - If amounts are unclear or missing, mark as not verified(false)
    - NO PENDING STATUS ALLOWED
    
    MANDATORY VALIDATION RULES:
    1. All amounts must be exact numbers from documents
    2. No approximations or assumptions allowed
    3. Verification must be true/false only
    4. Monthly income must match latest payslip exactly
    5. Cross-verify all amounts across documents
    
    Income Documents Analysis:
    ${incomeContent}

    Credit Profile Analysis:
    ${creditContent}

    Identity Verification Records:
    ${identityContent}

    Provide ALL numbers in the exact format found in documents with no modifications.`,
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
