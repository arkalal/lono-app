import mongoose, { Schema } from "mongoose";

const fileUploadSchema = new Schema(
  {
    fileName: {
      type: String,
    },
    chunkText: {
      type: String,
    },
    chunkIndex: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

const FileUpload =
  mongoose.models.FileUpload || mongoose.model("FileUpload", fileUploadSchema);

export default FileUpload;
