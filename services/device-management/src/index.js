require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const deviceRoutes = require('./routes/device.routes');

const app = express();
const PORT = process.env.DEVICE_MANAGEMENT_PORT || 3001;

app.use(morgan('combined'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'device-management', timestamp: new Date().toISOString() });
});

app.use('/api/v1/devices', deviceRoutes);

app.use((err, req, res, next) => {
  console.error('[DeviceMgmt] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[Device Management] Running on port ${PORT}`);
});
