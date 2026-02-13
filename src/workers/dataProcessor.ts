import * as XLSX from 'xlsx';
import { ProcessedData, RentalRecord, MonthlyAggregation, WorkerMessage, WorkerResponse } from '../types';

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, file } = e.data;

  if (type === 'PARSE') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: '', raw: true });

      const processed = processRawData(jsonData);
      
      // Calculate Hash for Integrity Check (SHA-256)
      // We hash the normalized records to ensure content identity
      const msgBuffer = new TextEncoder().encode(JSON.stringify(processed.records));
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const response: WorkerResponse = {
        type: 'SUCCESS',
        data: processed,
        hash: hashHex
      };

      self.postMessage(response);
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }
};

const parseDate = (val: any): Date | null => {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (!val) return null;
  const str = String(val).trim();
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const [_, d, m, y] = dmyMatch;
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
};

const parseNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val).trim();
  if (str === '') return 0;
  const isNegative = str.startsWith('(') && str.endsWith(')');
  if (isNegative) str = str.slice(1, -1);
  str = str.replace(/[€$£a-zA-Z\s]/g, '');
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
  else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2) str = str.replace(/\./g, '');
    else if (parts.length === 2 && parts[1].length === 3) str = str.replace(/\./g, '');
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : (isNegative ? -num : num);
};

const findColumnKey = (row: any, candidates: string[]): string | undefined => {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const foundKey = keys.find(key => key.toLowerCase().trim() === candidate || key.toLowerCase().trim().includes(candidate));
    if (foundKey) return foundKey;
  }
  return undefined;
};

const processRawData = (data: any[]): ProcessedData => {
  const records: RentalRecord[] = [];
  const stationSet = new Set<string>();
  const groupSet = new Set<string>();
  const monthSet = new Set<string>();
  let dataYear = 0;

  if (data.length === 0) {
    return { records: [], stations: [], groups: [], months: [], totalRecords: 0, year: 0 };
  }

  const firstRow = data[0];
  const stationKey = findColumnKey(firstRow, ['station', 'check-out station', 'checkout station']);
  const dateKey = findColumnKey(firstRow, ['check-out date', 'checkout date', 'date']);
  const daysKey = findColumnKey(firstRow, ['days', 'duration']);
  const chargeKey = findColumnKey(firstRow, ['rental charge', 'amount', 'charge', 'price']);
  const groupKey = findColumnKey(firstRow, ['charged group', 'car group', 'group', 'category']);

  data.forEach((row, index) => {
    if (!stationKey || !dateKey || !daysKey || !chargeKey) return;

    const station = String(row[stationKey] || '').trim();
    if (!station) return;

    const date = parseDate(row[dateKey]);
    if (!date) return;

    const days = parseNumber(row[daysKey]);
    const charge = parseNumber(row[chargeKey]);
    if (days <= 0) return;

    const group = groupKey ? String(row[groupKey] || 'Unknown').trim() : 'Unknown';
    const year = date.getFullYear();
    const month = date.getMonth(); 
    const day = date.getDate();

    // Heuristic: Set dataset year based on majority of data
    if (index === 0) dataYear = year;

    const paddedMonth = (month + 1).toString().padStart(2, '0');
    const monthKey = `${year}-${paddedMonth}`;
    const displayDate = date.toLocaleString('default', { month: 'short', year: 'numeric' });

    stationSet.add(station);
    groupSet.add(group);
    monthSet.add(monthKey);

    records.push({
      id: index,
      station,
      stationKey: station.toLowerCase().trim(),
      group,
      groupKey: group.toLowerCase().trim(),
      date,
      monthKey,
      displayDate,
      day,
      days,
      charge,
      year
    });
  });

  return {
    records,
    stations: Array.from(stationSet).sort(),
    groups: Array.from(groupSet).sort(),
    months: Array.from(monthSet).sort(),
    totalRecords: records.length,
    year: dataYear
  };
};