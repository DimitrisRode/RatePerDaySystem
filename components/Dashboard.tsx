import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProcessedData, RentalRecord, MonthlyAggregation } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { ArrowLeft, Table, TrendingUp, Calendar, Sparkles, Euro, Filter, ChevronDown, Check } from 'lucide-react';
import { generateDataInsights } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface DashboardProps {
  data: ProcessedData;
  onReset: () => void;
}

type DateRangeType = 'All' | '1-10' | '11-20' | '21-End';

export const Dashboard: React.FC<DashboardProps> = ({ data, onReset }) => {
  const [selectedStation, setSelectedStation] = useState<string>('All');
  // Changed to array for multi-select
  const [selectedGroups, setSelectedGroups] = useState<string[]>(['All']);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeType>('All');
  
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGroupDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset selected groups when station changes
  useEffect(() => {
    setSelectedGroups(['All']);
  }, [selectedStation]);

  // Derive available groups based on selected station
  const availableGroups = useMemo(() => {
    if (selectedStation === 'All') {
      return data.groups;
    }
    const groupsInStation = new Set<string>();
    data.records.forEach(r => {
      if (r.station === selectedStation) {
        groupsInStation.add(r.group);
      }
    });
    return Array.from(groupsInStation).sort();
  }, [data.records, data.groups, selectedStation]);

  // 1. Filter Records based on selection
  const filteredRecords = useMemo(() => {
    return data.records.filter(r => {
      const stationMatch = selectedStation === 'All' || r.station === selectedStation;
      
      // Multi-select logic: 'All' matches everything, otherwise check if group is in selected list
      const groupMatch = selectedGroups.includes('All') || selectedGroups.includes(r.group);
      
      let dateMatch = true;
      if (selectedDateRange === '1-10') dateMatch = r.day >= 1 && r.day <= 10;
      else if (selectedDateRange === '11-20') dateMatch = r.day >= 11 && r.day <= 20;
      else if (selectedDateRange === '21-End') dateMatch = r.day >= 21;

      return stationMatch && groupMatch && dateMatch;
    });
  }, [data.records, selectedStation, selectedGroups, selectedDateRange]);

  // 2. Aggregate Data by Month for Chart/Table
  const aggregatedData = useMemo(() => {
    const map = new Map<string, MonthlyAggregation>();

    // Initialize all months to 0 to ensure continuity in charts
    data.months.forEach(mKey => {
      // Find a record with this monthKey to get the correct displayDate, or reconstruct it
      const displayDate = new Date(parseInt(mKey.split('-')[0]), parseInt(mKey.split('-')[1]) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
      
      map.set(mKey, {
        monthKey: mKey,
        displayDate,
        totalRevenue: 0,
        totalDays: 0,
        avgRate: 0,
        reservationCount: 0
      });
    });

    // Sum up filtered records
    filteredRecords.forEach(r => {
      const entry = map.get(r.monthKey);
      if (entry) {
        entry.totalRevenue += r.charge;
        entry.totalDays += r.days;
        entry.reservationCount += 1;
      }
    });

    // Calculate Averages
    const result = Array.from(map.values()).map(item => ({
      ...item,
      avgRate: item.totalDays > 0 ? item.totalRevenue / item.totalDays : 0
    }));

    return result.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [filteredRecords, data.months]);

  // 3. Global Metrics for the current view
  const currentViewMetrics = useMemo(() => {
    const totalRev = filteredRecords.reduce((acc, r) => acc + r.charge, 0);
    const totalDays = filteredRecords.reduce((acc, r) => acc + r.days, 0);
    const avgRate = totalDays > 0 ? totalRev / totalDays : 0;
    return { totalRev, totalDays, avgRate };
  }, [filteredRecords]);

  const handleGenerateInsights = async () => {
    setIsGeneratingAi(true);
    // Pass the currently viewed aggregation to the AI
    const groupLabel = selectedGroups.includes('All') 
      ? 'All Groups' 
      : selectedGroups.join(', ');
      
    const insight = await generateDataInsights(aggregatedData, selectedStation, groupLabel);
    setAiInsight(insight);
    setIsGeneratingAi(false);
  };

  const toggleGroupSelection = (grp: string) => {
    if (grp === 'All') {
      setSelectedGroups(['All']);
      setIsGroupDropdownOpen(false);
      return;
    }

    let newSelection = [...selectedGroups];
    
    // If 'All' was selected, clear it and start fresh with the new group
    if (newSelection.includes('All')) {
      newSelection = [grp];
    } else {
      if (newSelection.includes(grp)) {
        newSelection = newSelection.filter(g => g !== grp);
      } else {
        newSelection.push(grp);
      }
    }

    // If nothing selected, revert to 'All'
    if (newSelection.length === 0) {
      newSelection = ['All'];
    }

    setSelectedGroups(newSelection);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={onReset}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Rental Analytics</h1>
              <p className="text-xs text-slate-400 font-medium">
                {filteredRecords.length.toLocaleString()} records filtered
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
               {data.totalRecords.toLocaleString()} Total Rows
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            
            {/* Station Filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Station</label>
              <select 
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium w-full md:w-48"
              >
                <option value="All">All Stations</option>
                {data.stations.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>

            {/* Group Filter (Multi-Select) */}
            <div className="flex flex-col gap-1 relative" ref={dropdownRef}>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Car Group</label>
              <button 
                onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                className="bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-3 pr-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium w-full md:w-48 text-left flex items-center justify-between"
              >
                <span className="truncate block max-w-[140px]">
                  {selectedGroups.includes('All') 
                    ? 'All Groups' 
                    : selectedGroups.length === 1 
                      ? selectedGroups[0] 
                      : `${selectedGroups.length} Groups`}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {isGroupDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto custom-scrollbar">
                   <div 
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100"
                    onClick={() => toggleGroupSelection('All')}
                  >
                    <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${selectedGroups.includes('All') ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {selectedGroups.includes('All') && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-sm ${selectedGroups.includes('All') ? 'font-medium text-blue-600' : 'text-slate-700'}`}>All Groups</span>
                  </div>
                  
                  {availableGroups.map(grp => {
                    const isSelected = selectedGroups.includes(grp);
                    return (
                      <div 
                        key={grp}
                        className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                        onClick={() => toggleGroupSelection(grp)}
                      >
                        <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-sm ${isSelected ? 'font-medium text-slate-900' : 'text-slate-600'}`}>{grp}</span>
                      </div>
                    );
                  })}
                  {availableGroups.length === 0 && (
                     <div className="p-4 text-center text-xs text-slate-400">
                       No groups available for this station.
                     </div>
                  )}
                </div>
              )}
            </div>

             {/* Date Range Filter */}
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

          {/* View Mode Toggles */}
          <div className="flex bg-slate-100 rounded-lg p-1 self-end md:self-center">
            <button
              onClick={() => setViewMode('chart')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'chart' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <TrendingUp className="w-4 h-4" />
              Chart
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Table className="w-4 h-4" />
              Table
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Visualization (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  Monthly Average Daily Rate
                </h2>
                {selectedDateRange !== 'All' && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                    Filtered: {selectedDateRange}
                  </span>
                )}
              </div>
              
              {viewMode === 'chart' ? (
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aggregatedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="displayDate" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 10 }} 
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                        tickFormatter={(val) => `€${val}`}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`€${value.toFixed(2)}`, 'Avg Daily Rate']}
                      />
                      <Bar 
                        dataKey="avgRate" 
                        fill="#3b82f6" 
                        radius={[4, 4, 0, 0]} 
                        barSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="overflow-hidden overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Month</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Revenue</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Days</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Rate</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {aggregatedData.map(row => {
                         if (row.totalDays === 0) return null;
                         return (
                          <tr key={row.monthKey} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{row.displayDate}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right">€{row.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right">{row.totalDays.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600 text-right">€{row.avgRate.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Side Panel: Insights & Metrics (1/3 width) */}
          <div className="space-y-6">
            {/* Quick Metrics Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Performance Metrics (Selection)
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg text-green-600">
                      <Euro className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total Revenue</p>
                      <p className="text-lg font-bold text-slate-900">
                        €{currentViewMetrics.totalRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                </div>

                 <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total Days Rented</p>
                      <p className="text-lg font-bold text-slate-900">
                        {currentViewMetrics.totalDays.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Avg Rate (Overall)</p>
                      <p className="text-lg font-bold text-slate-900">
                        €{currentViewMetrics.avgRate.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Insights Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
               <div className="absolute top-0 right-0 p-3 opacity-10">
                 <Sparkles className="w-24 h-24" />
               </div>
               
               <h3 className="text-lg font-bold flex items-center gap-2 mb-4 relative z-10">
                 <Sparkles className="w-5 h-5" />
                 AI Analysis
               </h3>

               {!aiInsight ? (
                 <div className="relative z-10">
                   <p className="text-indigo-100 text-sm mb-4">
                     Analyze the current selection (Station: {selectedStation}, Group: {selectedGroups.includes('All') ? 'All' : selectedGroups.length > 3 ? 'Multiple' : selectedGroups.join(', ')}) using Gemini AI.
                   </p>
                   <button 
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingAi}
                    className="w-full py-2 bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm border border-white/20 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                   >
                     {isGeneratingAi ? (
                       <>Generating...</>
                     ) : (
                       <>Generate Report</>
                     )}
                   </button>
                 </div>
               ) : (
                 <div className="relative z-10 bg-white/10 rounded-xl p-4 backdrop-blur-md max-h-[400px] overflow-y-auto custom-scrollbar">
                   <div className="prose prose-invert prose-sm">
                    <ReactMarkdown>{aiInsight}</ReactMarkdown>
                   </div>
                   <button 
                     onClick={() => setAiInsight(null)}
                     className="mt-4 text-xs text-indigo-200 hover:text-white underline"
                   >
                     Clear Analysis
                   </button>
                 </div>
               )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};
