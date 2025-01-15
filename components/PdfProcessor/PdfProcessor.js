"use client";

import React, { useState, useRef } from "react";
import styles from "./PdfProcessor.module.scss";
import { FaFileUpload } from "react-icons/fa";
import PdfViewer from "../chunks/PdfViewer/PdfViewer";
import axios from "../../axios/api";
import axios2 from "../../axios/api2";

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
      const saveData = new FormData();
      Array.from([file]).forEach((file) => {
        saveData.append("files", file);
      });

      setExtractedText("Processing PDF...");
      console.log("Uploading PDF file...");

      const response = await axios.post("saveFiles", saveData);
      console.log("API Response:", response.data);

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      const aiAnalysis = await axios2.post("extractPdf", {
        query: "Give me an analysis report",
      });

      setExtractedText(aiAnalysis.data || "No content extracted");
    } catch (error) {
      console.error("Error extracting PDF content:", error);
      setExtractedText(
        `Error: ${error.message || "Failed to extract content from PDF"}`
      );
    } finally {
      setTimeout(() => {
        // Add any refresh logic if needed
        console.log("Upload complete");
      }, 1000);
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
