"use client";

import React from "react";
import styles from "./PdfViewer.module.scss";

const PdfViewer = ({ file, extractedText }) => {
  const fileUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div className={styles.pdfViewer}>
      <div className={styles.pdfContainer}>
        {fileUrl && (
          <object
            data={fileUrl}
            type="application/pdf"
            className={styles.document}
          >
            <p>Unable to display PDF file.</p>
          </object>
        )}
      </div>
      <div className={styles.extractedContent}>
        <h3>Extracted Content</h3>
        <div className={styles.contentBox}>
          {extractedText ? (
            <pre>{extractedText}</pre>
          ) : (
            <div className={styles.loader}>Extracting content...</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;
