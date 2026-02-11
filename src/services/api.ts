import { AppMetadata, ProcessedData } from "../types";

// Helper to get CSRF token from cookie
const getCsrfToken = () => {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];
};

const headers = () => ({
  'Content-Type': 'application/json',
  'X-XSRF-TOKEN': getCsrfToken() || ''
});

export const api = {
  checkAuth: async (): Promise<{ isAuthenticated: boolean; metadata?: AppMetadata }> => {
    try {
      const res = await fetch('/api/config');
      
      // If server returns HTML (e.g. 404/500), treat as auth failure
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return { isAuthenticated: false };
      }

      if (res.status === 401) return { isAuthenticated: false };
      
      const data = await res.json();
      return { isAuthenticated: true, metadata: data };
    } catch (e) {
      console.error("Auth check failed:", e);
      return { isAuthenticated: false };
    }
  },

  login: async (password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ password })
      });
      
      if (!res.ok) return false;
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
         // This implies a server error or misconfiguration (returning HTML)
         throw new Error("Server returned non-JSON response");
      }

      const data = await res.json();
      return data.success;
    } catch (e) {
      console.error("Login failed:", e);
      throw e; // Re-throw to let UI show connection error
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: headers() });
    } catch (e) {
      console.error("Logout failed:", e);
    }
  },

  uploadDataset: async (
    year: number, 
    records: any[], 
    hash: string, 
    onProgress: (msg: string) => void
  ): Promise<void> => {
    // 1. Init Upload
    onProgress('Initiating secure upload...');
    const initRes = await fetch('/api/upload/init', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ year: String(year), type: 'records', hash })
    });

    if (!initRes.ok) throw new Error('Upload initialization failed');
    const { signedUrl, status } = await initRes.json();

    if (status === 'exists') {
      onProgress('Data is already up to date.');
      return;
    }

    // 2. Direct Upload to GCS
    onProgress('Uploading to secure storage (GCS)...');
    const uploadRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records)
    });

    if (!uploadRes.ok) throw new Error('Storage upload failed');

    // 3. Finalize
    onProgress('Verifying and finalizing...');
    const finalRes = await fetch('/api/upload/finalize', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ year: String(year), type: 'records', hash })
    });

    if (!finalRes.ok) throw new Error('Finalization failed');
    onProgress('Success!');
  },

  fetchYearData: async (year: string): Promise<ProcessedData> => {
    // 1. Get Read Signed URL
    const res = await fetch(`/api/years/${year}/records`, { headers: headers() });
    if (!res.ok) throw new Error('Failed to fetch data link');
    const { url } = await res.json();

    // 2. Download from GCS
    const dataRes = await fetch(url);
    const records = await dataRes.json();
    
    // 3. Reconstruct ProcessedData (lightweight calc)
    // Note: In a real optimized app, we would fetch stats.json separately.
    // Here we reconstruct minimal ProcessedData to fit existing types.
    const recordsWithDates = records.map((r: any) => ({
      ...r,
      date: new Date(r.date)
    }));

    return {
      records: recordsWithDates,
      stations: Array.from(new Set(recordsWithDates.map((r: any) => r.station))).sort() as string[],
      groups: Array.from(new Set(recordsWithDates.map((r: any) => r.group))).sort() as string[],
      months: Array.from(new Set(recordsWithDates.map((r: any) => r.monthKey))).sort() as string[],
      totalRecords: recordsWithDates.length,
      year: parseInt(year)
    };
  }
};