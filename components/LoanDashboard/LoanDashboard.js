"use client";

import React, { useState, useEffect } from "react";
import styles from "./LoanDashboard.module.scss";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import axios from "../../axios/api2";
import Image from "next/image";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

const LoanDashboard = ({ id }) => {
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const response = await axios.get(`loan-analysis/${id}`);
        setAnalysisData(response.data.analysis);
      } catch (error) {
        console.error("Error fetching analysis:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [id]);

  if (loading) {
    return <div className={styles.loading}>Loading dashboard...</div>;
  }

  if (!analysisData) {
    return <div className={styles.error}>Analysis data not found</div>;
  }

  const {
    personalInfo,
    incomeAnalysis,
    creditAnalysis,
    loanEligibility,
    documentVerification,
  } = analysisData;

  // Prepare data for income chart
  const incomeData = [
    {
      name: "Monthly Income",
      amount: incomeAnalysis.monthlyIncome,
    },
    {
      name: "Average Monthly",
      amount: incomeAnalysis.averageMonthlyIncome,
    },
  ];

  // Prepare data for loan eligibility pie chart
  const loanData = [
    {
      name: "Recommended",
      value: loanEligibility.recommendedLoanAmount,
    },
    {
      name: "Additional Available",
      value:
        loanEligibility.maxLoanAmount - loanEligibility.recommendedLoanAmount,
    },
  ];

  const handleDelete = async () => {
    try {
      await axios.delete(`loan-analysis/${id}`);
      // Call the onDeleteSuccess prop after successful deletion
      onDeleteSuccess?.();
    } catch (error) {
      console.error("Error deleting application:", error);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.profileSection}>
          <div className={styles.profileImage}>
            {/* <Image
              width={50}
              height={50}
              src={personalInfo.photoUrl}
              alt={personalInfo.name}
            /> */}
          </div>
          <div className={styles.profileInfo}>
            <h1>{personalInfo.name}</h1>
            <p>Age: {personalInfo.age}</p>
            <p>Credit Score: {personalInfo.creditScore}</p>
          </div>
        </div>
        <button onClick={handleDelete} className={styles.deleteButton}>
          Delete Application
        </button>
      </header>

      <div className={styles.mainContent}>
        <div className={styles.eligibilityCard}>
          <h2>Loan Eligibility Summary</h2>
          <div className={styles.eligibilityStatus}>
            <div
              className={`${styles.statusIndicator} ${
                loanEligibility.isEligible ? styles.eligible : styles.ineligible
              }`}
            />
            <p>{loanEligibility.isEligible ? "Eligible" : "Not Eligible"}</p>
          </div>
          <div className={styles.amounts}>
            <div>
              <h3>Maximum Loan</h3>
              <p>₹{loanEligibility.maxLoanAmount.toLocaleString()}</p>
            </div>
            <div>
              <h3>Recommended</h3>
              <p>₹{loanEligibility.recommendedLoanAmount.toLocaleString()}</p>
            </div>
            <div>
              <h3>Interest Rate</h3>
              <p>{loanEligibility.suggestedInterestRate}%</p>
            </div>
          </div>
          <div className={styles.reason}>
            <h3>Decision Reasoning</h3>
            <p>{loanEligibility.reasonForDecision}</p>
          </div>
        </div>

        <div className={styles.chartsSection}>
          <div className={styles.chartCard}>
            <h3>Income Analysis</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={incomeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#8884d8"
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.chartCard}>
            <h3>Loan Amount Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={loanData}
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label
                >
                  {loanData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.detailsSection}>
          <div className={styles.creditAnalysis}>
            <h3>Credit Analysis</h3>
            <div className={styles.creditDetails}>
              <div>
                <h4>Credit Score</h4>
                <p>{creditAnalysis.creditScore}</p>
              </div>
              <div>
                <h4>Credit Risk</h4>
                <p>{creditAnalysis.creditRisk}</p>
              </div>
              <div>
                <h4>History</h4>
                <p>{creditAnalysis.creditHistory}</p>
              </div>
            </div>
          </div>

          <div className={styles.documentStatus}>
            <h3>Document Verification Status</h3>
            <div className={styles.documentList}>
              <div className={styles.documentItem}>
                <span>Payslips</span>
                <span
                  className={`${styles.status} ${
                    documentVerification.payslipsVerified
                      ? styles.verified
                      : styles.unverified
                  }`}
                >
                  {documentVerification.payslipsVerified
                    ? "Verified"
                    : "Pending"}
                </span>
              </div>
              <div className={styles.documentItem}>
                <span>Bank Statements</span>
                <span
                  className={`${styles.status} ${
                    documentVerification.bankStatementsVerified
                      ? styles.verified
                      : styles.unverified
                  }`}
                >
                  {documentVerification.bankStatementsVerified
                    ? "Verified"
                    : "Pending"}
                </span>
              </div>
              <div className={styles.documentItem}>
                <span>Identity Documents</span>
                <span
                  className={`${styles.status} ${
                    documentVerification.identityDocumentsVerified
                      ? styles.verified
                      : styles.unverified
                  }`}
                >
                  {documentVerification.identityDocumentsVerified
                    ? "Verified"
                    : "Pending"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoanDashboard;
