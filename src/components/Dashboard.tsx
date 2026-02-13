import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProcessedData, DatasetRegistry } from '../types';
import { useComparisonData } from '../hooks/useComparisonData';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  ArrowLeft, Table, TrendingUp, Calendar, Sparkles, Euro, ChevronDown, Check,
  ArrowRightLeft, Loader2
} from 'lucide-react';
import { generateDataInsights } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface DashboardProps {
  registry: DatasetRegistry;
  primaryYear: number;
  comparisonYear: number | 'none';
  availableYears: number[];
  loadingYears: Set<number>;
  onSetPrimaryYear: (y: number) => void;
  onSetComparisonYear: (y: number | 'none') => void;
  onLoadYear: (y: number) => Promise<void>;
  onReset: () => void;
}

type DateRangeType = 'All' | '1-10' | '11-20' | '21-End';

export const Dashboard: React.FC<DashboardProps> = ({ 
  registry, 
  primaryYear, 
  comparisonYear,
  availableYears,
  loadingYears,
  onSetPrimaryYear,
  onSetComparisonYear,
  onLoadYear,
  onReset 
}) => {
  const [selectedStation, setSelectedStation] = useState<string>('All');
  const [selectedGroups, setSelectedGroups] = useState<string[]>(['All']);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeType>('All');
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Derived Data
  const primaryData = registry[primaryYear];
  const comparisonData = comparisonYear !== 'none' ? registry[comparisonYear] : undefined;

  // Comparison Hook
  const { alignedMonths, totals } = useComparisonData(
    primaryData,
    comparisonData,
    selectedStation,
    selectedGroups,
    selectedDateRange
  );

  // Group handling
  useEffect(() => {
    setSelectedGroups(['All']);
  }, [selectedStation]);

  const availableGroups = useMemo(() => {
    if (selectedStation === 'All') return primaryData.groups;
    const groupsInStation = new Set<string>();
    primaryData.records.forEach(r => {
      if (r.station === selectedStation) groupsInStation.add(r.group);
    });
    return Array.from(groupsInStation).sort();
  }, [primaryData, selectedStation]);

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGroupDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handlers
  const handlePrimaryYearChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const year = parseInt(e.target.value);
    onSetPrimaryYear(year);
    if (!registry[year]) {
      await onLoadYear(year);
    }
  };

  const handleComparisonYearChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'none') {
      onSetComparisonYear('none');
    } else {
      const year = parseInt(val);
      onSetComparisonYear(year);
      if (!registry[year]) {
        await onLoadYear(year);
      }
    }
  };

  const toggleGroupSelection = (grp: string) => {
    if (grp === 'All') {
      setSelectedGroups(['All']);
      setIsGroupDropdownOpen(false);
      return;
    }
    let newSelection = [...selectedGroups];
    if (newSelection.includes('All')) newSelection = [grp];
    else if (newSelection.includes(grp)) newSelection = newSelection.filter(g => g !== grp);
    else newSelection.push(grp);
    
    if (newSelection.length === 0) newSelection = ['All'];
    setSelectedGroups(newSelection);
  };

  const formatCurrency = (val: number) => `€${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatPct = (val: number | null) => {
    if (val === null) return null;
    return `${(val * 100).toFixed(1)}%`;
  };

  const getVarianceBadge = (val: number | null) => {
    if (val === null) return null;
    const isPositive = val >= 0;
    return (
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ml-2 ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {isPositive ? '↑' : '↓'} {Math.abs(val * 100).toFixed(1)}%
      </span>
    );
  };

  const isComparisonActive = comparisonYear !== 'none';
  const isSyncing = loadingYears.has(primaryYear) || (comparisonYear !== 'none' && loadingYears.has(comparisonYear));

  // Chart Data Preparation
  const chartData = useMemo(() => {
    return alignedMonths.map(m => ({
      name: m.monthName,
      // Map hasData=false to null so Recharts breaks the bar/line
      primary: m.primary.hasData ? m.primary.rate : null,
      comparison: m.comparison.hasData ? m.comparison.rate : null,
      primaryRev: m.primary.hasData ? m.primary.revenue : null,
      comparisonRev: m.comparison.hasData ? m.comparison.revenue : null,
    }));
  }, [alignedMonths]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Control Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onReset} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
               {/* Primary Year Selector */}
               <div className="flex flex-col">
                 <label className="text-[10px] uppercase font-bold text-slate-400 leading-none">Primary</label>
                 <select 
                   value={primaryYear} 
                   onChange={handlePrimaryYearChange}
                   className="font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                 >
                   {availableYears.map(y => (
                     <option key={y} value={y}>{y}</option>
                   ))}
                 </select>
               </div>

               {/* Separator */}
               <ArrowRightLeft className="w-4 h-4 text-slate-300" />

               {/* Comparison Year Selector */}
               <div className="flex flex-col">
                 <label className="text-[10px] uppercase font-bold text-slate-400 leading-none">Compare</label>
                 <div className="flex items-center gap-2">
                   <select 
                     value={comparisonYear} 
                     onChange={handleComparisonYearChange}
                     className={`font-medium text-sm bg-transparent focus:outline-none cursor-pointer ${comparisonYear === 'none' ? 'text-slate-400' : 'text-slate-600'}`}
                   >
                     <option value="none">None</option>
                     {availableYears.filter(y => y !== primaryYear).map(y => (
                       <option key={y} value={y}>{y}</option>
                     ))}
                   </select>
                   {isSyncing && <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />}
                 </div>
               </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
               {primaryData.totalRecords.toLocaleString()} Records ({primaryYear})
            </span>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 transition-opacity duration-300 ${isSyncing ? 'opacity-70 pointer-events-none' : 'opacity-100'}`}>
        
        {/* Filters */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Station</label>
              <select 
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium w-full md:w-48"
              >
                <option value="All">All Stations</option>
                {primaryData.stations.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1 relative" ref={dropdownRef}>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Car Group</label>
              <button 
                onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                className="bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-3 pr-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium w-full md:w-48 text-left flex items-center justify-between"
              >
                <span className="truncate block max-w-[140px]">
                  {selectedGroups.includes('All') ? 'All Groups' : selectedGroups.length === 1 ? selectedGroups[0] : `${selectedGroups.length} Groups`}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {isGroupDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto custom-scrollbar">
                   <div className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100" onClick={() => toggleGroupSelection('All')}>
                    <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${selectedGroups.includes('All') ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {selectedGroups.includes('All') && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-sm ${selectedGroups.includes('All') ? 'font-medium text-blue-600' : 'text-slate-700'}`}>All Groups</span>
                  </div>
                  {availableGroups.map(grp => {
                    const isSelected = selectedGroups.includes(grp);
                    return (
                      <div key={grp} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer" onClick={() => toggleGroupSelection(grp)}>
                        <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-sm ${isSelected ? 'font-medium text-slate-900' : 'text-slate-600'}`}>{grp}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Month Period</label>
              <select 
                value={selectedDateRange}
                onChange={(e) => setSelectedDateRange(e.target.value as DateRangeType)}
                className="bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium w-full md:w-48"
              >
                <option value="All">Whole Month</option>
                <option value="1-10">1st - 10th</option>
                <option value="11-20">11th - 20th</option>
                <option value="21-End">21st - End</option>
              </select>
            </div>
          </div>

          <div className="flex bg-slate-100 rounded-lg p-1">
            <button onClick={() => setViewMode('chart')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'chart' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>
              <TrendingUp className="w-4 h-4" /> Chart
            </button>
            <button onClick={() => setViewMode('table')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>
              <Table className="w-4 h-4" /> Table
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  Monthly Average Daily Rate
                  {isComparisonActive && <span className="text-sm font-normal text-slate-500 ml-2">({primaryYear} vs {comparisonYear})</span>}
                </h2>
              </div>
              
              {viewMode === 'chart' ? (
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(val) => `€${val}`} />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any, name: any) => {
                          const num =
                            typeof value === "number"
                            ? value
                            : value == null
                            ? null
                            : Number(value);

                          const label =
                            name === "primary"
                            ? `${primaryYear} Rate`
                            : `${comparisonYear} Rate`;

                          return [
                            num == null || Number.isNaN(num)
                            ? "No Data"
                            : `€${num.toFixed(2)}`,
                            label,
                          ];
                        }}

                      />
                      <Legend />
                      <Bar name={`${primaryYear}`} dataKey="primary" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={isComparisonActive ? 20 : 40} />
                      {isComparisonActive && <Bar name={`${comparisonYear}`} dataKey="comparison" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="overflow-hidden overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Month</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Rate {primaryYear}</th>
                        {isComparisonActive && (
                          <>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Rate {comparisonYear}</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Variance</th>
                          </>
                        )}
                         <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase border-l border-slate-200">Rev {primaryYear}</th>
                         {isComparisonActive && <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Rev {comparisonYear}</th>}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {alignedMonths.map(row => {
                         if (!row.primary.hasData && !row.comparison.hasData) return null;
                         return (
                          <tr key={row.monthIndex} className="hover:bg-slate-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{row.monthName}</td>
                            <td className="px-6 py-4 text-sm font-bold text-blue-600 text-right">{row.primary.hasData ? `€${row.primary.rate.toFixed(2)}` : '—'}</td>
                            {isComparisonActive && (
                              <>
                                <td className="px-6 py-4 text-sm text-slate-400 text-right">{row.comparison.hasData ? `€${row.comparison.rate.toFixed(2)}` : '—'}</td>
                                <td className="px-6 py-4 text-sm text-right">{getVarianceBadge(row.variance.rate)}</td>
                              </>
                            )}
                            <td className="px-6 py-4 text-sm text-slate-600 text-right border-l border-slate-200">{row.primary.hasData ? formatCurrency(row.primary.revenue) : '—'}</td>
                            {isComparisonActive && <td className="px-6 py-4 text-sm text-slate-400 text-right">{row.comparison.hasData ? formatCurrency(row.comparison.revenue) : '—'}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Key Metrics ({primaryYear})
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg text-green-600"><Euro className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-slate-500">Total Revenue</p>
                      <div className="flex items-center">
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(totals.primary.revenue)}</p>
                        {isComparisonActive && getVarianceBadge(totals.variance.revenue)}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Calendar className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-slate-500">Total Days</p>
                      <div className="flex items-center">
                        <p className="text-lg font-bold text-slate-900">{totals.primary.days.toLocaleString()}</p>
                        {isComparisonActive && getVarianceBadge(totals.variance.days)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><TrendingUp className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-slate-500">Avg Rate</p>
                      <div className="flex items-center">
                        <p className="text-lg font-bold text-slate-900">€{totals.primary.rate.toFixed(2)}</p>
                        {isComparisonActive && getVarianceBadge(totals.variance.rate)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Section (Simplified for now, using aggregate data) */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
               <div className="absolute top-0 right-0 p-3 opacity-10"><Sparkles className="w-24 h-24" /></div>
               <h3 className="text-lg font-bold flex items-center gap-2 mb-4 relative z-10"><Sparkles className="w-5 h-5" /> AI Analysis</h3>
               {!aiInsight ? (
                 <div className="relative z-10">
                   <p className="text-indigo-100 text-sm mb-4">Analyze {primaryYear} performance for {selectedStation}.</p>
                   <button onClick={() => { setIsGeneratingAi(true); /* Simplified call */ setTimeout(() => { setAiInsight("AI Analysis simulated for " + primaryYear); setIsGeneratingAi(false); }, 1000); }} disabled={isGeneratingAi} className="w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 rounded-lg font-semibold flex items-center justify-center gap-2">
                     {isGeneratingAi ? 'Generating...' : 'Generate Report'}
                   </button>
                 </div>
               ) : (
                 <div className="relative z-10 bg-white/10 rounded-xl p-4 backdrop-blur-md max-h-[400px] overflow-y-auto custom-scrollbar">
                   <div className="prose prose-invert prose-sm"><ReactMarkdown>{aiInsight}</ReactMarkdown></div>
                   <button onClick={() => setAiInsight(null)} className="mt-4 text-xs text-indigo-200 hover:text-white underline">Clear Analysis</button>
                 </div>
               )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
