export interface RentalRecord {
  id: number;
  station: string;
  group: string;
  date: Date;
  monthKey: string; // YYYY-MM
  displayDate: string; // Month YYYY
  day: number; // 1-31
  days: number;
  charge: number;
  // For uniqueness across years
  year: number; 
}

export interface MonthlyAggregation {
  monthKey: string;
  displayDate: string;
  totalRevenue: number;
  totalDays: number;
  avgRate: number;
  reservationCount: number;
}

export interface ProcessedData {
  records: RentalRecord[];
  stations: string[];
  groups: string[];
  months: string[]; // Sorted unique month keys
  totalRecords: number;
  year: number;
}

export interface YearMetadata {
  status: 'active' | 'pending' | 'missing';
  version: number;
  rowCount: number;
  lastUpdated?: string;
  recordsPath?: string;
  statsPath?: string;
}

export interface AppMetadata {
  years: Record<string, YearMetadata>;
  lastUpdated: string;
}

export interface WorkerMessage {
  type: 'PARSE';
  file: File;
}

export interface WorkerResponse {
  type: 'SUCCESS' | 'ERROR';
  data?: ProcessedData;
  stats?: MonthlyAggregation[];
  hash?: string;
  error?: string;
}

export type UploadStatus = 'idle' | 'parsing' | 'uploading' | 'finalizing' | 'success' | 'error';
