import * as XLSX from 'xlsx';
import { ProcessedData, RentalRecord } from '../types';

export const parseExcelFile = (file: File): Promise<ProcessedData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Use raw: true to get actual numbers from Excel if they exist.
        // This prevents parsing errors on fields that are already valid numbers.
        const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: '', raw: true });
        
        const processed = processRawData(jsonData);
        resolve(processed);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

const parseDate = (val: any): Date | null => {
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  
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
  // If Excel gives us a number directly, trust it.
  if (typeof val === 'number') return val;
  if (!val) return 0;

  let str = String(val).trim();
  if (str === '') return 0;

  // Handle accounting format (123) -> -123
  const isNegative = str.startsWith('(') && str.endsWith(')');
  if (isNegative) str = str.slice(1, -1);

  // Remove currency and text
  str = str.replace(/[€$£a-zA-Z\s]/g, '');

  // Intelligent Parsing Logic
  // 1. If string contains a comma, we assume European format (Comma = Decimal)
  //    e.g. "54,11" -> 54.11 | "1.200,50" -> 1200.50
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } 
  // 2. If NO comma, but contains dots
  else if (str.includes('.')) {
    const parts = str.split('.');
    
    // If multiple dots (1.234.567) -> It's a thousands separator
    if (parts.length > 2) {
      str = str.replace(/\./g, '');
    } 
    // If one dot, we need to guess: Decimal or Thousand?
    else if (parts.length === 2) {
      // Heuristic: In the context of a European file, 
      // "1.200" (3 decimals) is usually 1,200 (Thousand).
      // "54.11" (2 decimals) or "8341466.45" (2 decimals) is usually a float.
      const decimals = parts[1];
      if (decimals.length === 3) {
        // Assume thousands separator -> 1200
        str = str.replace(/\./g, '');
      }
      // Else assume standard float -> 54.11 (Leave dot as is)
    }
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

  if (data.length === 0) {
    return { records: [], stations: [], groups: [], months: [], totalRecords: 0 };
  }

  const firstRow = data[0];
  const stationKey = findColumnKey(firstRow, ['station', 'check-out station', 'checkout station']);
  const dateKey = findColumnKey(firstRow, ['check-out date', 'checkout date', 'date']);
  const daysKey = findColumnKey(firstRow, ['days', 'duration']);
  const chargeKey = findColumnKey(firstRow, ['rental charge', 'amount', 'charge', 'price']);
  const groupKey = findColumnKey(firstRow, ['charged group', 'car group', 'group', 'category']);

  console.log('Column Mapping:', { stationKey, dateKey, daysKey, chargeKey, groupKey });

  data.forEach((row, index) => {
    if (!stationKey || !dateKey || !daysKey || !chargeKey) return;

    const stationNameRaw = row[stationKey];
    const dateRaw = row[dateKey];
    const daysRaw = row[daysKey];
    const chargeRaw = row[chargeKey];
    const groupRaw = groupKey ? row[groupKey] : 'Unknown';

    if (!stationNameRaw) return;
    
    const station = String(stationNameRaw).trim();
    const group = String(groupRaw).trim();
    const date = parseDate(dateRaw);
    if (!date) return;

    const days = parseNumber(daysRaw);
    const charge = parseNumber(chargeRaw);

    if (days <= 0) return; // Skip invalid durations

    const year = date.getFullYear();
    const month = date.getMonth(); 
    const day = date.getDate();

    const paddedMonth = (month + 1).toString().padStart(2, '0');
    const monthKey = `${year}-${paddedMonth}`;
    const displayDate = date.toLocaleString('default', { month: 'short', year: 'numeric' });

    stationSet.add(station);
    groupSet.add(group);
    monthSet.add(monthKey);

    records.push({
      id: index,
      station,
      group,
      date,
      monthKey,
      displayDate,
      day,
      days,
      charge
    });
  });

  return {
    records,
    stations: Array.from(stationSet).sort(),
    groups: Array.from(groupSet).sort(),
    months: Array.from(monthSet).sort(),
    totalRecords: records.length
  };
};