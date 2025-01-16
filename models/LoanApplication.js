import mongoose, { Schema } from "mongoose";

const loanApplicationSchema = new Schema(
  {
    name: { type: String, required: true },
    age: { type: Number, required: true },
    creditScore: { type: Number, required: true },
    email: { type: String, required: true },
    photoUrl: { type: String, required: true },
    documents: {
      payslips: [
        {
          fileName: String,
          chunkIds: [{ type: Schema.Types.ObjectId, ref: "FileUpload" }],
        },
      ],
      bankStatements: [
        {
          fileName: String,
          chunkIds: [{ type: Schema.Types.ObjectId, ref: "FileUpload" }],
        },
      ],
      panCard: {
        fileName: String,
        chunkIds: [{ type: Schema.Types.ObjectId, ref: "FileUpload" }],
      },
      aadhaarCard: {
        fileName: String,
        chunkIds: [{ type: Schema.Types.ObjectId, ref: "FileUpload" }],
      },
    },
    status: {
      type: String,
      enum: ["pending", "analyzed", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

const LoanApplication =
  mongoose.models.LoanApplication ||
  mongoose.model("LoanApplication", loanApplicationSchema);
export default LoanApplication;
