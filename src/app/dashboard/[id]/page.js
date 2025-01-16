"use client";

import React from "react";
import { useRouter, useParams } from "next/navigation";
import LoanDashboard from "../../../../components/LoanDashboard/LoanDashboard";

const DashboardPage = () => {
  const router = useRouter();
  const params = useParams(); // Use useParams hook

  const handleDeleteSuccess = () => {
    router.push("/");
  };

  return <LoanDashboard id={params.id} onDeleteSuccess={handleDeleteSuccess} />;
};

export default DashboardPage;
