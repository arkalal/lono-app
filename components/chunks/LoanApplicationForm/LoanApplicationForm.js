"use client";

import React, { useState } from "react";
import styles from "./LoanApplicationForm.module.scss";
import axios from "../../../axios/api";

const LoanApplicationForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    creditScore: "",
    email: "",
    photo: null,
    payslips: [],
    bankStatements: [],
    panCard: null,
    aadhaarCard: null,
  });

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (name === "payslips" || name === "bankStatements") {
      setFormData((prev) => ({
        ...prev,
        [name]: Array.from(files),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: files[0],
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUploadProgress(0);

    try {
      const formDataToSend = new FormData();

      // Add basic info
      formDataToSend.append("name", formData.name);
      formDataToSend.append("age", formData.age);
      formDataToSend.append("creditScore", formData.creditScore);
      formDataToSend.append("email", formData.email);

      // Add photo
      formDataToSend.append("photo", formData.photo);

      // Add multiple payslips
      formData.payslips.forEach((file, index) => {
        formDataToSend.append("payslips", file);
      });

      // Add multiple bank statements
      formData.bankStatements.forEach((file, index) => {
        formDataToSend.append("bankStatements", file);
      });

      // Add ID documents
      formDataToSend.append("panCard", formData.panCard);
      formDataToSend.append("aadhaarCard", formData.aadhaarCard);

      const response = await axios.post("loan-application", formDataToSend, {
        onUploadProgress: (progressEvent) => {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          setUploadProgress(Math.round(progress));
        },
      });

      if (response.data.success) {
        // Handle success (you can add notification or redirect)
        console.log("Application submitted successfully");
      }
    } catch (error) {
      console.error("Error submitting application:", error);
      // Handle error (you can add error notification)
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loanApplicationForm}>
      <h1>Loan Application Form</h1>

      <form onSubmit={handleSubmit}>
        <div className={styles.formSection}>
          <h2>Personal Information</h2>

          <div className={styles.formGroup}>
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="age">Age</label>
            <input
              type="number"
              id="age"
              name="age"
              value={formData.age}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="creditScore">Credit Score</label>
            <input
              type="number"
              id="creditScore"
              name="creditScore"
              value={formData.creditScore}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>

        <div className={styles.formSection}>
          <h2>Documents</h2>

          <div className={styles.formGroup}>
            <label htmlFor="photo">Passport Size Photo</label>
            <input
              type="file"
              id="photo"
              name="photo"
              accept="image/*"
              onChange={handleFileChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="payslips">Last 3 Months Payslips (PDF)</label>
            <input
              type="file"
              id="payslips"
              name="payslips"
              accept=".pdf"
              multiple
              onChange={handleFileChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="bankStatements">Bank Statements (PDF)</label>
            <input
              type="file"
              id="bankStatements"
              name="bankStatements"
              accept=".pdf"
              multiple
              onChange={handleFileChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="panCard">PAN Card (PDF)</label>
            <input
              type="file"
              id="panCard"
              name="panCard"
              accept=".pdf"
              onChange={handleFileChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="aadhaarCard">Aadhaar Card (PDF)</label>
            <input
              type="file"
              id="aadhaarCard"
              name="aadhaarCard"
              accept=".pdf"
              onChange={handleFileChange}
              required
            />
          </div>
        </div>

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        )}

        <button
          type="submit"
          className={styles.submitButton}
          disabled={loading}
        >
          {loading ? "Submitting..." : "Submit Application"}
        </button>
      </form>
    </div>
  );
};

export default LoanApplicationForm;
