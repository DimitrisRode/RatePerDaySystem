export interface RentalRecord {
  id: number;
  station: string;
  stationKey: string; // Normalized for comparison
  group: string;
  groupKey: string;   // Normalized for comparison
  date: Date;
  monthKey: string; // YYYY-MM
  displayDate: string; // Month YYYY
  day: number; // 1-31
  days: number;
  charge: number;
  // For uniqueness across years
  year: number; 
}

export interface MetricSet {
  revenue: number;
  days: number;
  count: number;
  rate: number; // Calculated: revenue / days (if days > 0)
  hasData: boolean; // True if records exist, False if future/empty
}

export interface VarianceSet {
  revenue: number | null;
  days: number | null;
  rate: number | null;
}

export interface AlignedMonth {
  monthIndex: number; // 0-11
  monthName: string;  // "Jan", "Feb"...
  primary: MetricSet;
  comparison: MetricSet;
  variance: VarianceSet;
}

export interface ComparisonResult {
  alignedMonths: AlignedMonth[];
  totals: {
    primary: MetricSet;
    comparison: MetricSet;
    variance: VarianceSet;
  };
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

export type DatasetRegistry = Record<number, ProcessedData>;

export interface YearMetadata {
  status: 'active' | 'pending' | 'missing';
  version: number;
  rowCount: number;
  lastUpdated?: string;
  recordsPath?: string;
  statsPath?: string;
  hash?: string;
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