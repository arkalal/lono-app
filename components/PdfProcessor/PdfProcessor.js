"use client";

import React, { useState, useRef } from "react";
import styles from "./PdfProcessor.module.scss";
import { FaFileUpload } from "react-icons/fa";
import PdfViewer from "../chunks/PdfViewer/PdfViewer";

const PdfProcessor = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const [extractedText, setExtractedText] = useState("");

  console.log("extractedText", extractedText);

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === "application/pdf") {
      setFile(droppedFile);
      uploadFile(droppedFile);
    }
  };

  const handleFileInput = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile?.type === "application/pdf") {
      setFile(selectedFile);
      uploadFile(selectedFile);
    }
  };

  const uploadFile = async (file) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        extractPdfContent(file);
      }
    }, 500);
  };

  const extractPdfContent = async (file) => {
    try {
      const formData = new FormData();
      formData.append("pdf", file);

      setExtractedText("Processing PDF...");

      const response = await fetch("/api/extractPdf", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      console.log("result", result);

      if (!response.ok) {
        throw new Error(result.error || "Failed to extract PDF content");
      }

      setExtractedText(result.text || "No content extracted");
    } catch (error) {
      console.error("Error extracting PDF content:", error);
      setExtractedText(
        `Error: ${error.message || "Failed to extract content from PDF"}`
      );
    }
  };

  return (
    <div className={styles.pdfProcessor}>
      <div className={styles.uploadContainer}>
        <div
          className={`${styles.dropZone} ${isDragging ? styles.dragging : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <FaFileUpload className={styles.uploadIcon} />
          <h3>Drag & Drop PDF or Click to Upload</h3>
          <p>Only PDF files are supported</p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            accept=".pdf"
            style={{ display: "none" }}
          />
        </div>
        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className={styles.progressBar}>
            <div
              className={styles.progress}
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        )}
      </div>

      {file && uploadProgress === 100 && (
        <PdfViewer file={file} extractedText={extractedText} />
      )}
    </div>
  );
};

export default PdfProcessor;
