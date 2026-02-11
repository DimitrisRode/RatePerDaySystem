import React, { useCallback } from 'react';
import { Upload, FileSpreadsheet, Loader2, AlertCircle } from 'lucide-react';
import { UploadStatus } from '../types';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  status: UploadStatus;
  error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, status, error }) => {
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (status === 'parsing') return;
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      onFileUpload(file);
    }
  }, [onFileUpload, status]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
      <div 
        className={`w-full max-w-xl p-12 bg-white rounded-3xl shadow-xl border-2 border-dashed transition-all duration-300 text-center
          ${status === 'parsing' ? 'border-blue-400 bg-blue-50 opacity-80 cursor-wait' : 'border-slate-300 hover:border-blue-500 hover:shadow-2xl cursor-pointer'}
        `}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-6 pointer-events-none">
          {status === 'parsing' ? (
            <div className="relative">
              <div className="absolute inset-0 bg-blue-400 rounded-full opacity-20 animate-ping"></div>
              <Loader2 className="w-20 h-20 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div className="p-6 bg-blue-50 rounded-full">
              <FileSpreadsheet className="w-16 h-16 text-blue-600" />
            </div>
          )}
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-800">
              {status === 'parsing' ? 'Processing large dataset...' : 'Upload your Excel File'}
            </h2>
            <p className="text-slate-500">
              {status === 'parsing' 
                ? 'Please wait while we crunch the numbers (approx. 58k rows).' 
                : 'Drag & drop or click to browse'}
            </p>
          </div>

          {status !== 'parsing' && (
            <label className="pointer-events-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-200 cursor-pointer">
              Browse Files
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                className="hidden" 
                onChange={handleChange}
              />
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-3 px-6 py-4 bg-red-50 text-red-700 rounded-xl border border-red-200 animate-fade-in">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};
