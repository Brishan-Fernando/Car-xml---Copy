import React, { useState } from "react";
import FileUploadComponent from "../components/FileUploadComponent";
import ProofreadingWorkspace from "../components/ProofreadingWorkspace";
import "./Dashboard.css";

function Dashboard() {
  const [results, setResults] = useState(null);

  const handleUploadResult = (data) => {
    setResults(data);
  };

  const resultData = results?.data || results || null;

  // Once files are uploaded, show only the workspace (full screen)
  if (resultData) {
    return <ProofreadingWorkspace data={resultData} onReset={() => setResults(null)} />;
  }

  // Before upload: show the upload screen
  return (
    <FileUploadComponent
      setResults={handleUploadResult}
    />
  );
}

export default Dashboard;