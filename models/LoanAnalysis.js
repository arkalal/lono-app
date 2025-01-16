import mongoose, { Schema } from "mongoose";

const loanAnalysisSchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "LoanApplication",
      required: true,
    },
    analysis: {
      personalInfo: {
        name: String,
        age: Number,
        creditScore: Number,
        photoUrl: String,
      },
      incomeAnalysis: {
        monthlyIncome: Number,
        annualIncome: Number,
        incomeStability: String,
        averageMonthlyIncome: Number,
      },
      creditAnalysis: {
        creditScore: Number,
        creditHistory: String,
        creditRisk: String,
      },
      loanEligibility: {
        isEligible: Boolean,
        maxLoanAmount: Number,
        recommendedLoanAmount: Number,
        riskLevel: String,
        reasonForDecision: String,
        suggestedInterestRate: Number,
      },
      documentVerification: {
        payslipsVerified: Boolean,
        bankStatementsVerified: Boolean,
        identityDocumentsVerified: Boolean,
      },
    },
    status: {
      type: String,
      enum: ["completed", "failed"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  }
);

const LoanAnalysis =
  mongoose.models.LoanAnalysis ||
  mongoose.model("LoanAnalysis", loanAnalysisSchema);
export default LoanAnalysis;
