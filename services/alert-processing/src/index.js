require('dotenv').config();
const express = require('express');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const fallRule = require('./rules/fall.rule');
const heartRateRule = require('./rules/heartRate.rule');
const inactivityRule = require('./rules/inactivity.rule');

const app = express();
const PORT = process.env.ALERT_PROCESSING_PORT || 3003;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'alert-processing', timestamp: new Date().toISOString() });
});

app.get('/api/v1/alerts', async (req, res) => {
  const { elderlyId, status, severity, limit = 20, offset = 0 } = req.query;
  const conditions = ['1=1'];
  const params = [];

  if (elderlyId) { conditions.push(`elderly_profile_id = $${params.length + 1}`); params.push(elderlyId); }
  if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }
  if (severity) { conditions.push(`severity = $${params.length + 1}`); params.push(severity); }

  try {
    const result = await pool.query(
      `SELECT * FROM alerts WHERE ${conditions.join(' AND ')}
       ORDER BY triggered_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json({ alerts: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.patch('/api/v1/alerts/:alertId/acknowledge', async (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    const result = await pool.query(
      `UPDATE alerts SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(), acknowledged_by = $1
       WHERE id = $2 AND status = 'OPEN' RETURNING *`,
      [userId, req.params.alertId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found or already acknowledged' });
    res.json({ alert: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

app.patch('/api/v1/alerts/:alertId/resolve', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { isFalsePositive } = req.body;
  try {
    const newStatus = isFalsePositive ? 'FALSE_POSITIVE' : 'RESOLVED';
    const result = await pool.query(
      `UPDATE alerts SET status = $1, resolved_at = NOW(), resolved_by = $2
       WHERE id = $3 RETURNING *`,
      [newStatus, userId, req.params.alertId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ alert: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

app.listen(PORT, () => console.log(`[Alert Processing] HTTP on port ${PORT}`));

const kafka = new Kafka({
  clientId: 'alert-processing',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'alert-processing-group' });
const alertProducer = kafka.producer();

async function getElderlyProfile(elderlyId) {
  const result = await pool.query(
    'SELECT * FROM elderly_profiles WHERE id = $1',
    [elderlyId]
  );
  return result.rows[0] || null;
}

async function getDeviceBySerial(serial) {
  const result = await pool.query(
    'SELECT id FROM devices WHERE device_serial = $1',
    [serial]
  );
  return result.rows[0] || null;
}

async function persistAlert(alert, elderlyId, deviceId, location) {
  const result = await pool.query(
    `INSERT INTO alerts
       (id, elderly_profile_id, device_id, type, severity, status, title, description,
        metadata, location_lat, location_lng, ml_confidence, triggered_at)
     VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,$8,$9,$10,$11,NOW())
     RETURNING *`,
    [
      uuidv4(), elderlyId, deviceId || null,
      alert.type, alert.severity, alert.title, alert.description,
      JSON.stringify(alert.metadata || {}),
      location?.lat || null, location?.lng || null,
      alert.confidence || null,
    ]
  );
  return result.rows[0];
}

async function processPayload(topic, payload) {
  const elderlyId = payload.elderlyId;
  if (!elderlyId) return;

  const [elderlyProfile, device] = await Promise.all([
    getElderlyProfile(elderlyId),
    getDeviceBySerial(payload.deviceSerial),
  ]);

  let ruleAlerts = [];

  if (topic === 'silverlink.device-alerts') {
    ruleAlerts = fallRule.evaluate(payload);
  } else if (topic === 'silverlink.telemetry') {
    const [fallAlerts, hrAlerts, inactivityAlerts] = await Promise.all([
      Promise.resolve(fallRule.evaluate(payload)),
      Promise.resolve(heartRateRule.evaluate(payload)),
      inactivityRule.evaluate(payload, elderlyProfile),
    ]);
    ruleAlerts = [...fallAlerts, ...hrAlerts, ...inactivityAlerts];
  }

  for (const alert of ruleAlerts) {
    try {
      const persisted = await persistAlert(alert, elderlyId, device?.id, payload.location);
      await alertProducer.send({
        topic: 'silverlink.alerts',
        messages: [{ key: elderlyId, value: JSON.stringify({ ...persisted, elderlyProfile }) }],
      });
      console.log(`[AlertProcessing] Alert created: ${alert.type} for elderly ${elderlyId}`);
    } catch (err) {
      console.error('[AlertProcessing] Failed to persist alert:', err.message);
    }
  }
}

async function startKafka() {
  await Promise.all([consumer.connect(), alertProducer.connect()]);
  await consumer.subscribe({ topics: ['silverlink.telemetry', 'silverlink.device-alerts'], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        await processPayload(topic, payload);
      } catch (err) {
        console.error('[AlertProcessing] Message processing error:', err.message);
      }
    },
  });

  console.log('[AlertProcessing] Kafka consumer running');
}

startKafka().catch((err) => {
  console.error('[AlertProcessing] Kafka startup failed:', err);
  process.exit(1);
});
