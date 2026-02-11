import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { Dashboard } from './components/Dashboard';
import { ProcessedData, UploadStatus } from './types';
import { parseExcelFile } from './utils/excelProcessor';
// Import xlsx via CDN in the HTML file is one way, but standard practice in bundlers is to assume node_modules.
// Since we are simulating, we rely on the implementation in excelProcessor.ts which imports 'xlsx'.

const App: React.FC = () => {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | undefined>(undefined);

  const handleFileUpload = async (file: File) => {
    setStatus('parsing');
    setError(undefined);

    try {
      // Small timeout to allow UI to update to 'parsing' state before heavy lifting
      setTimeout(async () => {
        try {
          const processed = await parseExcelFile(file);
          if (processed.totalRecords === 0) {
            setError("No valid records found in the uploaded file.");
            setStatus('error');
            return;
          }
          setData(processed);
          setStatus('success');
        } catch (e) {
          console.error(e);
          setError("Failed to parse the Excel file. Please ensure it matches the expected format.");
          setStatus('error');
        }
      }, 100);
    } catch (e) {
       setStatus('error');
    }
  };

  const handleReset = () => {
    setData(null);
    setStatus('idle');
    setError(undefined);
  };

  return (
    <div className="antialiased text-slate-900">
      {data ? (
        <Dashboard data={data} onReset={handleReset} />
      ) : (
        <FileUpload 
          onFileUpload={handleFileUpload} 
          status={status} 
          error={error} 
        />
      )}
    </div>
  );
};

export default App;
