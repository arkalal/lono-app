"use client";
import React, { useState, useRef } from "react";
import styles from "./PdfProcessor.module.scss";
import PdfViewer from "../chunks/PdfViewer/PdfViewer";
import axios from "../../axios/api";
import axios2 from "../../axios/api2";

const PdfProcessor = () => {
  const [File, setFile] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileInput = async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      setFile(files);
      await handleSave(files);
    }
  };

  const handleSave = async (files) => {
    try {
      setUploadProgress(10);
      const saveData = new FormData();
      Array.from(files).forEach((file) => {
        saveData.append("files", file);
      });

      setExtractedText("Processing PDF...");
      console.log("Uploading PDF file...");

      setUploadProgress(50);
      // await axios.post("files", saveData);

      setUploadProgress(80);
      const aiAnalysis = await axios2.post("extractPdf", {
        query: "Give me an analysis report",
      });

      console.log(aiAnalysis.data);

      setUploadProgress(100);
      setExtractedText(aiAnalysis.data || "No content extracted");
    } catch (error) {
      console.error("Error uploading file:", error);
      setExtractedText(`Error: ${error.message || "Failed to upload file"}`);
    }
  };

  return (
    <div className={styles.pdfProcessor}>
      <div className={styles.uploadContainer}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          accept=".pdf"
        />
        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className={styles.progressBar}>
            <div
              className={styles.progress}
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        )}
      </div>
      {uploadProgress === 100 && (
        <PdfViewer file={File?.[0]} extractedText={extractedText} />
      )}

      <div className={styles.textContainer}>
        <p>{extractedText}</p>
      </div>
    </div>
  );
};

export default PdfProcessor;
