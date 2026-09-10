const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/db.js');
const initSocket = require('./config/socket.js');
const allRoutes = require('./routes/index.js');
const errorMiddleware = require('./middleware/errorMiddleware.js');
const { refreshNewsFeed } = require('./controllers/newsController.js');
  
// Connect to DB
connectDB();

const app = express();
const httpServer = http.createServer(app);

// Init Socket.IO
initSocket(httpServer);

// ─── Security Headers ───────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
})); 

// ─── CORS ───────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
  process.env.FRONTEND_URL,
  ...(process.env.FRONTEND_URLS ? process.env.FRONTEND_URLS.split(',') : [])
].filter(Boolean).map(origin => origin.trim()).filter(Boolean);


const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const parsed = new URL(origin);

    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }

    const allowedHostSuffixes = ['.render.com', '.vercel.app', '.netlify.app'];
    return allowedHostSuffixes.some((suffix) => parsed.hostname.endsWith(suffix));
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy violation for origin: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ─── Compression ────────────────────────────────
app.use(compression());

// ─── Body Parsing ───────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Sanitize NoSQL Injection ───────────────────
app.use(mongoSanitize());

// ─── Request Logging ────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ─── Global Rate Limiter ────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again in 15 minutes.' }
});
app.use('/api', globalLimiter);

// ─── Auth-specific Rate Limiter ─────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Increased for development testing
  message: { success: false, message: 'Too many auth attempts. Please try again in 15 minutes.' }
});
// app.use('/api/auth/login', authLimiter);
// app.use('/api/auth/register', authLimiter);
// app.use('/api/auth/forgot-password', authLimiter);

// ─── SOS bypass rate limit (critical safety) ────
const sosLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'SOS request limit reached.' }
});
app.use('/api/sos', sosLimiter);

// ─── Health Check ────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'Safe-Era API',
    status: 'OK',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date() });
});

// ─── API Routes ──────────────────────────────────
app.use('/api', allRoutes);

// ─── 404 Handler ────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// ─── Error Handler ───────────────────────────────
app.use(errorMiddleware);

// ─── Start Server ────────────────────────────────
const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
  console.log(`\n[API] Safe-Era API`);
  console.log(`[SERVER] Server: http://localhost:${PORT}`);
  console.log(`[ENV] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[DB] MongoDB: Connected\n`);

  refreshNewsFeed().catch((error) => console.warn(`[NEWS] Initial refresh failed: ${error.message}`));
  const newsRefreshTimer = setInterval(() => {
    refreshNewsFeed().catch((error) => console.warn(`[NEWS] Scheduled refresh failed: ${error.message}`));
  }, 10 * 60 * 1000);
  newsRefreshTimer.unref();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
