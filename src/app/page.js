import React from "react";
import PdfProcessor from "../../components/PdfProcessor/PdfProcessor";
import LoanApplicationForm from "../../components/chunks/LoanApplicationForm/LoanApplicationForm";

const page = () => {
  return (
    <div>
      {/* <PdfProcessor /> */}

      <LoanApplicationForm />
    </div>
  );
};

export default page;
