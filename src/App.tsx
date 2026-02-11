import React, { useState, useEffect, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { Dashboard } from './components/Dashboard';
import { ProcessedData, UploadStatus, AppMetadata } from './types';
import { parseExcelFile } from './utils/excelProcessor';
import { api } from './services/api';
import { Lock, LogOut, Cloud, CheckCircle, Database, AlertCircle, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  // Login State
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [metadata, setMetadata] = useState<AppMetadata | null>(null);
  
  // Data State
  const [historicalData, setHistoricalData] = useState<ProcessedData[]>([]);
  const [localData, setLocalData] = useState<ProcessedData | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadStatus>>({});
  const [loadingYears, setLoadingYears] = useState<string[]>([]);

  // Init
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setIsLoadingAuth(true);
    const result = await api.checkAuth();
    setIsAuthenticated(result.isAuthenticated);
    if (result.metadata) setMetadata(result.metadata);
    setIsLoadingAuth(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const success = await api.login(password);
      if (success) {
        await checkAuth();
      } else {
        setLoginError('Invalid Password');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Connection error. Please check server logs.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
    setHistoricalData([]);
    setLocalData(null);
  };

  const loadHistoricalYear = async (year: string) => {
    setLoadingYears(prev => [...prev, year]);
    try {
      const data = await api.fetchYearData(year);
      setHistoricalData(prev => [...prev.filter(d => d.year !== parseInt(year)), data]);
    } catch (e) {
      console.error(e);
      alert(`Failed to load ${year} data`);
    } finally {
      setLoadingYears(prev => prev.filter(y => y !== year));
    }
  };

  // Local Upload (2026)
  const handleLocalFileUpload = async (file: File) => {
    setUploadStatus(prev => ({ ...prev, local: 'parsing' }));
    try {
      const { data, hash } = await parseExcelFile(file);
      
      // If user wants to save this as a historical year (e.g. 2024 upload)
      // Check year of data
      if ([2023, 2024, 2025].includes(data.year)) {
        if (confirm(`This file contains data for ${data.year}. Do you want to upload it to the secure cloud?`)) {
           await handleCloudUpload(data.year, data.records, hash);
           return;
        }
      }

      setLocalData(data);
      setUploadStatus(prev => ({ ...prev, local: 'success' }));
    } catch (e) {
      console.error(e);
      setUploadStatus(prev => ({ ...prev, local: 'error' }));
    }
  };

  const handleCloudUpload = async (year: number, records: any[], hash: string) => {
    const key = String(year);
    setUploadStatus(prev => ({ ...prev, [key]: 'uploading' }));
    try {
      await api.uploadDataset(year, records, hash, (msg) => console.log(msg));
      setUploadStatus(prev => ({ ...prev, [key]: 'success' }));
      // Refresh metadata
      const res = await api.checkAuth();
      if (res.metadata) setMetadata(res.metadata);
    } catch (e) {
      console.error(e);
      setUploadStatus(prev => ({ ...prev, [key]: 'error' }));
      alert('Upload failed. See console.');
    }
  };

  // Merge Datasets
  const mergedData = useMemo(() => {
    const all = [...historicalData];
    if (localData) all.push(localData);
    if (all.length === 0) return null;

    // Merge logic
    const records = all.flatMap(d => d.records);
    // Re-sort and dedup auxiliary arrays
    const stations = Array.from(new Set(all.flatMap(d => d.stations))).sort();
    const groups = Array.from(new Set(all.flatMap(d => d.groups))).sort();
    const months = Array.from(new Set(all.flatMap(d => d.months))).sort();
    
    // Sort months strictly by date
    months.sort((a, b) => a.localeCompare(b));

    return {
      records,
      stations,
      groups,
      months,
      totalRecords: records.length,
      year: 0 // Mixed
    };
  }, [historicalData, localData]);


  if (isLoadingAuth) {
    return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-500">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="bg-blue-100 p-3 rounded-full w-fit mx-auto mb-4">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Secure Dashboard Access</h1>
            <p className="text-slate-500 text-sm mt-2">Enter the administrator password to access the data vault.</p>
          </div>
          <div className="space-y-2">
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Admin Password"
              disabled={isLoggingIn}
            />
            {loginError && <p className="text-red-500 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {loginError}</p>}
          </div>
          <button 
            type="submit" 
            disabled={isLoggingIn}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Accessing...
              </>
            ) : (
              'Access Dashboard'
            )}
          </button>
        </form>
      </div>
    );
  }

  // Data Manager View
  if (!mergedData) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <header className="flex justify-between items-center mb-8 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Data Management Console</h1>
            <p className="text-slate-500">Manage historical datasets and import new data.</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-600 hover:text-red-600 transition-colors">
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </header>

        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Cloud Storage Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Cloud className="w-5 h-5 text-blue-500" />
              Cloud Data Vault (2023-2025)
            </h2>
            <div className="space-y-4">
              {['2023', '2024', '2025'].map(year => {
                const meta = metadata?.years?.[year];
                const isLoaded = historicalData.some(d => d.year === parseInt(year));
                const isLoading = loadingYears.includes(year);
                
                return (
                  <div key={year} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${meta?.status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`} />
                      <span className="font-medium text-slate-700">{year} Dataset</span>
                      {meta?.status === 'active' && <span className="text-xs text-slate-400">v{meta.version}</span>}
                    </div>
                    {meta?.status === 'active' ? (
                      <button 
                        onClick={() => loadHistoricalYear(year)}
                        disabled={isLoaded || isLoading}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                          ${isLoaded 
                            ? 'bg-green-100 text-green-700 cursor-default' 
                            : 'bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-600 shadow-sm'}
                        `}
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isLoaded ? 'Loaded' : 'Load Data'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No Data</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Local Import */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
             <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-purple-500" />
              Current Data Import (2026)
            </h2>
            <div className="flex-1">
              <FileUpload 
                onFileUpload={handleLocalFileUpload} 
                status={uploadStatus['local'] || 'idle'} 
              />
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <Dashboard 
      data={mergedData} 
      onReset={() => {
        setLocalData(null);
        setHistoricalData([]);
      }} 
    />
  );
};

export default App;