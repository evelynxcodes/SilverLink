require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { param, body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.EMERGENCY_RESPONSE_PORT || 3007;

app.use(morgan('combined'));
app.use(express.json());

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  max: 10,
});

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'emergency-response', timestamp: new Date().toISOString() });
});

app.post('/api/v1/emergency/trigger',
  body('alertId').isUUID(),
  body('elderlyProfileId').isUUID(),
  validate,
  async (req, res) => {
    const { alertId, elderlyProfileId, dispatchAmbulance = false, notifyPdrm = false } = req.body;
    try {
      const profileResult = await pool.query(
        'SELECT name, home_address, home_lat, home_lng, medical_conditions FROM elderly_profiles WHERE id = $1',
        [elderlyProfileId]
      );
      if (profileResult.rows.length === 0) return res.status(404).json({ error: 'Elderly profile not found' });

      const profile = profileResult.rows[0];
      const caseId = uuidv4();
      const responders = [];

      if (dispatchAmbulance) {
        try {
          const ambResult = await axios.post(process.env.AMBULANCE_API_URL || 'http://mock-emergency-api/ambulance', {
            caseId,
            name: profile.name,
            address: profile.home_address,
            lat: profile.home_lat,
            lng: profile.home_lng,
            medicalConditions: profile.medical_conditions,
            alertId,
          }, { headers: { 'X-API-Key': process.env.AMBULANCE_API_KEY }, timeout: 5000 });
          responders.push({ type: 'AMBULANCE', status: 'DISPATCHED', refId: ambResult.data?.dispatchId });
        } catch (err) {
          console.error('[Emergency] Ambulance dispatch failed:', err.message);
          responders.push({ type: 'AMBULANCE', status: 'DISPATCH_FAILED', error: err.message });
        }
      }

      if (notifyPdrm) {
        try {
          const pdrmResult = await axios.post(process.env.PDRM_API_URL || 'http://mock-emergency-api/pdrm', {
            caseId, name: profile.name, address: profile.home_address,
            lat: profile.home_lat, lng: profile.home_lng, alertId,
          }, { headers: { 'X-API-Key': process.env.PDRM_API_KEY }, timeout: 5000 });
          responders.push({ type: 'PDRM', status: 'NOTIFIED', refId: pdrmResult.data?.caseRef });
        } catch (err) {
          console.error('[Emergency] PDRM notification failed:', err.message);
          responders.push({ type: 'PDRM', status: 'NOTIFY_FAILED', error: err.message });
        }
      }

      const result = await pool.query(
        `INSERT INTO emergency_cases (id, alert_id, elderly_profile_id, status, responders, dispatch_time)
         VALUES ($1,$2,$3,'TRIGGERED',$4, NOW()) RETURNING *`,
        [caseId, alertId, elderlyProfileId, JSON.stringify(responders)]
      );

      res.status(201).json({ emergencyCase: result.rows[0] });
    } catch (err) {
      console.error('[Emergency] trigger error:', err);
      res.status(500).json({ error: 'Failed to trigger emergency response' });
    }
  }
);

app.get('/api/v1/emergency/:caseId',
  param('caseId').isUUID(),
  validate,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ec.*, ep.name as elderly_name, ep.home_address, a.type as alert_type, a.severity
         FROM emergency_cases ec
         JOIN elderly_profiles ep ON ep.id = ec.elderly_profile_id
         JOIN alerts a ON a.id = ec.alert_id
         WHERE ec.id = $1`,
        [req.params.caseId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Emergency case not found' });
      res.json({ emergencyCase: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch emergency case' });
    }
  }
);

app.patch('/api/v1/emergency/:caseId/status',
  param('caseId').isUUID(),
  body('status').isIn(['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED']),
  validate,
  async (req, res) => {
    const { status, notes } = req.body;
    try {
      const extra = status === 'ON_SCENE' ? ', arrival_time = NOW()' : '';
      const resolved = status === 'RESOLVED' ? ', resolved_at = NOW()' : '';
      const result = await pool.query(
        `UPDATE emergency_cases SET status = $1, notes = COALESCE($2, notes)${extra}${resolved}, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [status, notes || null, req.params.caseId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Case not found' });
      res.json({ emergencyCase: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update emergency case' });
    }
  }
);

app.get('/api/v1/emergency/elderly/:elderlyId',
  param('elderlyId').isUUID(),
  validate,
  async (req, res) => {
    const { limit = 10 } = req.query;
    try {
      const result = await pool.query(
        `SELECT ec.*, a.type as alert_type, a.severity, a.triggered_at
         FROM emergency_cases ec
         JOIN alerts a ON a.id = ec.alert_id
         WHERE ec.elderly_profile_id = $1
         ORDER BY ec.created_at DESC LIMIT $2`,
        [req.params.elderlyId, limit]
      );
      res.json({ cases: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch emergency cases' });
    }
  }
);

app.listen(PORT, () => console.log(`[Emergency Response] Running on port ${PORT}`));

// Auto-trigger emergency cases for CRITICAL alerts
const kafka = new Kafka({
  clientId: 'emergency-response',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
});
const consumer = kafka.consumer({ groupId: 'emergency-response-group' });

async function startKafka() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'silverlink.alerts', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const alert = JSON.parse(message.value.toString());
        if (alert.severity === 'CRITICAL' && alert.type === 'FALL') {
          console.log(`[Emergency] Auto-creating case for CRITICAL FALL alert ${alert.id}`);
          await axios.post(`http://localhost:${PORT}/api/v1/emergency/trigger`, {
            alertId: alert.id,
            elderlyProfileId: alert.elderly_profile_id,
            dispatchAmbulance: true,
          }).catch((err) => console.error('[Emergency] Auto-dispatch error:', err.message));
        }
      } catch (err) {
        console.error('[Emergency] Kafka message error:', err.message);
      }
    },
  });
  console.log('[Emergency] Kafka consumer running — watching for CRITICAL alerts');
}

startKafka().catch(console.error);
