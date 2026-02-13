import React, { useState, useEffect, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { Dashboard } from './components/Dashboard';
import { ProcessedData, UploadStatus, AppMetadata, DatasetRegistry } from './types';
import { parseExcelFile } from './utils/excelProcessor';
import { api } from './services/api';
import { Lock, LogOut, Cloud, Database, AlertCircle, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  // Login State
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [metadata, setMetadata] = useState<AppMetadata | null>(null);
  
  // --- New Architecture State ---
  const [datasetRegistry, setDatasetRegistry] = useState<DatasetRegistry>({});
  const [primaryYear, setPrimaryYear] = useState<number | null>(null);
  const [comparisonYear, setComparisonYear] = useState<number | 'none'>('none');
  
  // Loading & In-flight tracking
  const [loadingYears, setLoadingYears] = useState<Set<number>>(new Set());
  const inflightRequests = useRef<Map<number, Promise<void>>>(new Map());
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadStatus>>({});

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
      if (success) await checkAuth();
      else setLoginError('Invalid Password');
    } catch (err) {
      console.error(err);
      setLoginError('Connection error.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
    setDatasetRegistry({});
    setPrimaryYear(null);
    setComparisonYear('none');
  };

  // --- Core Loading Logic ---

  const verifyYearMode = (data: ProcessedData, requestedYear: number): boolean => {
    const counts: Record<number, number> = {};
    let valid = 0;
    data.records.forEach(r => {
      if (r.date && !isNaN(r.date.getTime())) {
        const y = r.date.getFullYear();
        counts[y] = (counts[y] || 0) + 1;
        valid++;
      }
    });

    if (valid < 10) {
      console.warn("Insufficient data to verify year mode. Assuming correct.");
      return true;
    }

    const modeYear = parseInt(Object.entries(counts).reduce((a, b) => b[1] > a[1] ? b : a)[0]);
    if (modeYear !== requestedYear) {
      console.warn(`Year Mismatch: Requested ${requestedYear}, Found Mode ${modeYear}`);
      return false;
    }
    return true;
  };

  const loadYear = async (year: number): Promise<void> => {
    // 1. Cache Check
    if (datasetRegistry[year]) return;

    // 2. In-flight Deduplication
    if (inflightRequests.current.has(year)) {
      return inflightRequests.current.get(year);
    }

    // 3. Create Promise
    const promise = (async () => {
      setLoadingYears(prev => new Set(prev).add(year));
      try {
        const data = await api.fetchYearData(String(year));
        
        if (!verifyYearMode(data, year)) {
           alert(`Warning: The data for ${year} appears to contain mostly records from another year.`);
        }

        setDatasetRegistry(prev => ({ ...prev, [year]: data }));
      } catch (e) {
        console.error(`Failed to load ${year}`, e);
        alert(`Failed to download data for ${year}`);
      } finally {
        setLoadingYears(prev => {
          const next = new Set(prev);
          next.delete(year);
          return next;
        });
        inflightRequests.current.delete(year);
      }
    })();

    inflightRequests.current.set(year, promise);
    return promise;
  };

  // --- Upload Logic ---

  const handleLocalFileUpload = async (file: File) => {
    setUploadStatus(prev => ({ ...prev, local: 'parsing' }));
    try {
      const { data, hash } = await parseExcelFile(file);
      
      // Update Registry directly with local file
      setDatasetRegistry(prev => ({ ...prev, [data.year]: data }));
      
      // Auto-select if no primary is set
      if (!primaryYear) {
        setPrimaryYear(data.year);
      }

      // Prompt for Cloud Upload if historical
      if ([2023, 2024, 2025].includes(data.year)) {
        if (confirm(`Detected ${data.year} data. Upload to cloud for permanent storage?`)) {
           await handleCloudUpload(data.year, data.records, hash);
        }
      }
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
      const res = await api.checkAuth();
      if (res.metadata) setMetadata(res.metadata);
    } catch (e) {
      console.error(e);
      setUploadStatus(prev => ({ ...prev, [key]: 'error' }));
      alert('Upload failed.');
    }
  };

  const availableYears = React.useMemo(() => {
    const years = new Set<number>();
    // From Metadata
    if (metadata?.years) {
      Object.keys(metadata.years).forEach(y => years.add(parseInt(y)));
    }
    // From Registry (Local uploads)
    Object.keys(datasetRegistry).forEach(y => years.add(parseInt(y)));
    return Array.from(years).sort((a, b) => b - a); // Descending
  }, [metadata, datasetRegistry]);

  // --- Renders ---

  if (isLoadingAuth) {
    return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-500">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="bg-blue-100 p-3 rounded-full w-fit mx-auto mb-4"><Lock className="w-8 h-8 text-blue-600" /></div>
            <h1 className="text-2xl font-bold text-slate-800">Secure Dashboard Access</h1>
          </div>
          <div className="space-y-2">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Password" disabled={isLoggingIn} />
            {loginError && <p className="text-red-500 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {loginError}</p>}
          </div>
          <button type="submit" disabled={isLoggingIn} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
            {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Access Dashboard'}
          </button>
        </form>
      </div>
    );
  }

  // If no primary year is selected, show the Management Console
  if (!primaryYear) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <header className="flex justify-between items-center mb-8 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Data Management Console</h1>
            <p className="text-slate-500">Select a dataset to view or upload new data.</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-600 hover:text-red-600 transition-colors">
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </header>

        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Cloud className="w-5 h-5 text-blue-500" /> Cloud Datasets</h2>
            <div className="space-y-4">
              {['2023', '2024', '2025'].map(yearStr => {
                const year = parseInt(yearStr);
                const meta = metadata?.years?.[yearStr];
                const isLoaded = !!datasetRegistry[year];
                const isLoading = loadingYears.has(year);
                
                return (
                  <div key={year} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${meta?.status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`} />
                      <span className="font-medium text-slate-700">{year} Dataset</span>
                    </div>
                    {meta?.status === 'active' ? (
                      <button 
                        onClick={async () => {
                          if (!isLoaded) await loadYear(year);
                          setPrimaryYear(year);
                        }}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-600 shadow-sm transition-all"
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isLoaded ? 'Open' : 'Load & Open')}
                      </button>
                    ) : <span className="text-xs text-slate-400 italic">No Data</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
             <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Database className="w-5 h-5 text-purple-500" /> Import New Data</h2>
             <div className="flex-1">
               <FileUpload onFileUpload={handleLocalFileUpload} status={uploadStatus['local'] || 'idle'} />
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dashboard 
      registry={datasetRegistry}
      primaryYear={primaryYear}
      comparisonYear={comparisonYear}
      availableYears={availableYears}
      loadingYears={loadingYears}
      onSetPrimaryYear={setPrimaryYear}
      onSetComparisonYear={setComparisonYear}
      onLoadYear={loadYear}
      onReset={() => {
        setPrimaryYear(null);
        setComparisonYear('none');
      }} 
    />
  );
};

export default App;