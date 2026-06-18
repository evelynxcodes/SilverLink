require('dotenv').config();
const express = require('express');
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { sendPush } = require('./channels/push');
const { sendSms } = require('./channels/sms');

const app = express();
const PORT = process.env.NOTIFICATION_PORT || 3005;
app.use(express.json());

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  max: 10,
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification', timestamp: new Date().toISOString() });
});

app.get('/api/v1/notifications/history', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { limit = 20, offset = 0 } = req.query;
  try {
    const result = await pool.query(
      `SELECT nh.*, a.type as alert_type, a.severity, a.title as alert_title
       FROM notification_history nh
       LEFT JOIN alerts a ON a.id = nh.alert_id
       WHERE nh.user_id = $1
       ORDER BY nh.sent_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.listen(PORT, () => console.log(`[Notification] HTTP on port ${PORT}`));

async function getAlertRecipients(elderlyProfileId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.phone, u.fcm_token, u.role,
            uel.relationship, uel.can_receive_alerts, uel.alert_priority
     FROM users u
     JOIN user_elderly_links uel ON uel.user_id = u.id
     WHERE uel.elderly_profile_id = $1 AND uel.can_receive_alerts = TRUE AND u.is_active = TRUE
     ORDER BY uel.alert_priority`,
    [elderlyProfileId]
  );
  return result.rows;
}

async function recordNotification(userId, alertId, channel, status, payload) {
  await pool.query(
    `INSERT INTO notification_history (id, user_id, alert_id, channel, status, payload)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [uuidv4(), userId, alertId, channel, status, JSON.stringify(payload)]
  );
}

async function processAlert(alert) {
  const { id: alertId, elderly_profile_id, severity, title, description, elderlyProfile } = alert;
  const elderlyName = elderlyProfile?.name || 'Your elderly';

  const recipients = await getAlertRecipients(elderly_profile_id);
  if (recipients.length === 0) {
    console.warn(`[Notification] No recipients for elderly ${elderly_profile_id}`);
    return;
  }

  const isCritical = severity === 'CRITICAL' || severity === 'HIGH';

  for (const user of recipients) {
    const notifTitle = `SilverLink Alert: ${title}`;
    const notifBody = `${elderlyName} — ${description}`;

    // Always send push
    if (user.fcm_token) {
      const pushResult = await sendPush(user.fcm_token, notifTitle, notifBody, {
        alertId, severity, elderlyId: elderly_profile_id,
      });
      await recordNotification(user.id, alertId, 'PUSH', pushResult.success ? 'SENT' : 'FAILED', pushResult);
    }

    // SMS for HIGH/CRITICAL alerts
    if (isCritical && user.phone) {
      const smsText = `[SilverLink] ${elderlyName}: ${title}. ${description}. Check the app immediately. Reply HELP for emergency services.`;
      const smsResult = await sendSms(user.phone, smsText);
      await recordNotification(user.id, alertId, 'SMS', smsResult.success ? 'SENT' : 'FAILED', smsResult);
    }
  }

  console.log(`[Notification] Notified ${recipients.length} recipient(s) for alert ${alertId}`);
}

const kafka = new Kafka({
  clientId: 'notification',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
});
const consumer = kafka.consumer({ groupId: 'notification-group' });

async function startKafka() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'silverlink.alerts', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const alert = JSON.parse(message.value.toString());
        await processAlert(alert);
      } catch (err) {
        console.error('[Notification] Message processing error:', err.message);
      }
    },
  });

  console.log('[Notification] Kafka consumer running');
}

startKafka().catch((err) => {
  console.error('[Notification] Kafka startup failed:', err);
  process.exit(1);
});
