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
}

export type UploadStatus = 'idle' | 'parsing' | 'success' | 'error';
