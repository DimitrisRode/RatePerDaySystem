import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// Config
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'rental-analytics-data';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const IS_PROD = process.env.NODE_ENV === 'production';

// Storage
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

// Middleware
app.set('trust proxy', 1); // Trust Cloud Run Load Balancer
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Relaxed CSP for preview environments (AI Studio, IDX, Cloud Shell)
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'", 
        "cdn.tailwindcss.com", 
        "esm.sh", 
        "https://ai.studio",
        "*.google.com", 
        "*.gstatic.com"
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      connectSrc: [
        "'self'", 
        "https://storage.googleapis.com", 
        "https://esm.sh", 
        "https://ai.studio",
        "*.google.com", 
        "*.googleapis.com"
      ],
      imgSrc: ["'self'", "data:", "blob:", "*.googleusercontent.com"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "*.google.com", "https://ai.studio"]
    },
  },
}));
app.use(compression());
app.use(express.json());
app.use(cookieParser());

// CSRF Protection (Double Submit Cookie)
app.use((req, res, next) => {
  const token = req.cookies['XSRF-TOKEN'];
  if (!token) {
    const newToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    res.cookie('XSRF-TOKEN', newToken, { secure: IS_PROD, sameSite: 'strict' });
  }
  
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers['x-xsrf-token'];
    const cookieToken = req.cookies['XSRF-TOKEN'];
    if (!cookieToken || headerToken !== cookieToken) {
      return res.status(403).json({ error: 'CSRF Token Invalid' });
    }
  }
  next();
});

// Auth Middleware
const requireAuth = (req, res, next) => {
  const token = req.cookies['jwt_auth'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.clearCookie('jwt_auth');
    return res.status(401).json({ error: 'Invalid Token' });
  }
};

// --- API Routes ---

// Login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.cookie('jwt_auth', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: 8 * 3600 * 1000 // 8 hours
  });
  res.json({ success: true });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('jwt_auth');
  res.json({ success: true });
});

// Get Config & Metadata
app.get('/api/config', requireAuth, async (req, res) => {
  try {
    const file = bucket.file('metadata.json');
    const [exists] = await file.exists();
    if (!exists) {
      return res.json({ years: {}, lastUpdated: new Date().toISOString() });
    }
    const [content] = await file.download();
    try {
      res.json(JSON.parse(content.toString()));
    } catch (e) {
      console.warn("Corrupt metadata.json found, returning empty config.");
      res.json({ years: {}, lastUpdated: new Date().toISOString() });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// Init Upload (Get Signed URL)
app.post('/api/upload/init', requireAuth, async (req, res) => {
  const { year, type, hash } = req.body;
  
  if (!['2023', '2024', '2025'].includes(year) || type !== 'records' || !/^[a-f0-9]{64}$/.test(hash)) {
    return res.status(400).json({ error: 'Invalid input parameters' });
  }

  try {
    // Check current metadata for hash match
    const metaFile = bucket.file('metadata.json');
    const [exists] = await metaFile.exists();
    if (exists) {
      const [content] = await metaFile.download();
      try {
        const meta = JSON.parse(content.toString());
        if (meta.years && meta.years[year] && meta.years[year].hash === hash) {
          return res.json({ status: 'exists' });
        }
      } catch (e) {
        console.warn("Failed to parse metadata during init check, proceeding with upload.");
      }
    }

    // Generate path
    const timestamp = Date.now();
    const fileName = `data/${year}/${timestamp}_${hash}_${type}.json`;
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 min
      contentType: 'application/json',
    });

    res.json({ status: 'ok', signedUrl: url, path: fileName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to initiate upload' });
  }
});

// Finalize Upload
app.post('/api/upload/finalize', requireAuth, async (req, res) => {
  const { year, type, hash } = req.body;
  
  // Basic validation
  if (!year || !hash) return res.status(400).json({ error: 'Missing parameters' });

  try {
    // 1. Audit Log (Console only, to avoid GCS append issues)
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: 'finalize_upload',
      year,
      hash,
      ip: req.ip
    };
    console.log('[AUDIT]', JSON.stringify(auditEntry));

    // 2. Optimistic Lock Metadata Update
    const metaFile = bucket.file('metadata.json');
    
    // Simple retry loop for concurrency
    let retries = 3;
    while (retries > 0) {
      try {
        const [exists] = await metaFile.exists();
        let meta = { years: {}, lastUpdated: '' };
        let options = {};

        if (exists) {
          const [content, metadata] = await metaFile.download();
          try {
            meta = JSON.parse(content.toString());
          } catch (e) {
            console.warn("Metadata file exists but is invalid JSON. Overwriting.");
            meta = { years: {}, lastUpdated: '' };
          }
          // Optimistic locking
          options.ifGenerationMatch = metadata.generation;
        } else {
          options.ifGenerationMatch = 0;
        }

        // Update Metadata
        meta.lastUpdated = new Date().toISOString();
        if (!meta.years) meta.years = {};
        meta.years[year] = {
          status: 'active',
          version: (meta.years[year]?.version || 0) + 1,
          hash,
        };

        await metaFile.save(JSON.stringify(meta, null, 2), options);
        break; // Success
      } catch (e) {
        if (e.code === 412) { // Precondition Failed
          retries--;
          console.log(`Metadata update collision (412), retrying... (${retries} left)`);
          continue;
        }
        throw e;
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Finalization Error:", err);
    res.status(500).json({ error: 'Finalization failed' });
  }
});

// Get Records (Read Signed URL)
app.get('/api/years/:year/records', requireAuth, async (req, res) => {
  const { year } = req.params;
  try {
    const metaFile = bucket.file('metadata.json');
    const [exists] = await metaFile.exists();
    if (!exists) return res.status(404).json({ error: 'Data not initialized' });

    const [content] = await metaFile.download();
    let meta;
    try {
      meta = JSON.parse(content.toString());
    } catch (e) {
      return res.status(500).json({ error: 'Metadata corruption' });
    }
    
    if (!meta.years || !meta.years[year] || !meta.years[year].hash) {
      return res.status(404).json({ error: 'Data not found' });
    }

    // Improved Logic: We search for the file with the hash in the name.
    const [files] = await bucket.getFiles({ prefix: `data/${year}/` });
    const file = files.find(f => f.name.includes(meta.years[year].hash));

    if (!file) return res.status(404).json({ error: 'File object missing' });

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get download link' });
  }
});

// Serve React App
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});