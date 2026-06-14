require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const proxy = require('express-http-proxy');
const { verifyToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3000;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || '*' }));
app.use(morgan('combined'));
app.use(express.json());

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
});

app.use(globalLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

// Public routes (no auth required)
app.use('/api/v1/auth', authLimiter, proxy(process.env.USER_PROFILE_URL, {
  proxyReqPathResolver: (req) => `/api/v1/auth${req.url}`,
}));

// Protected routes
const services = {
  '/api/v1/devices': process.env.DEVICE_MANAGEMENT_URL,
  '/api/v1/telemetry': process.env.TELEMETRY_INGESTION_URL,
  '/api/v1/alerts': process.env.ALERT_PROCESSING_URL,
  '/api/v1/users': process.env.USER_PROFILE_URL,
  '/api/v1/elderly': process.env.USER_PROFILE_URL,
  '/api/v1/notifications': process.env.NOTIFICATION_URL,
  '/api/v1/analytics': process.env.ANALYTICS_URL,
  '/api/v1/emergency': process.env.EMERGENCY_RESPONSE_URL,
};

Object.entries(services).forEach(([path, serviceUrl]) => {
  app.use(path, verifyToken, proxy(serviceUrl, {
    proxyReqPathResolver: (req) => `${path}${req.url}`,
    proxyErrorHandler: (err, res, next) => {
      console.error(`[Gateway] Proxy error for ${path}:`, err.message);
      res.status(502).json({ error: 'Service temporarily unavailable' });
    },
  }));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`[API Gateway] Running on port ${PORT}`);
});
