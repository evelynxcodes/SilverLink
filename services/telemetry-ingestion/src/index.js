require('dotenv').config();
const express = require('express');
const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
const kafkaProducer = require('./kafka/producer');
const influx = require('./influx/writer');

const app = express();
const PORT = process.env.TELEMETRY_INGESTION_PORT || 3002;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'telemetry-ingestion', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`[Telemetry Ingestion] HTTP health on port ${PORT}`));

async function start() {
  await kafkaProducer.connect();

  const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
    clientId: `telemetry-svc-${uuidv4()}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 5000,
    clean: false,
  });

  mqttClient.on('connect', () => {
    console.log('[Telemetry] MQTT connected');
    mqttClient.subscribe('silverlink/devices/+/telemetry', { qos: 1 });
    mqttClient.subscribe('silverlink/devices/+/alerts', { qos: 2 });
    console.log('[Telemetry] Subscribed to device topics');
  });

  mqttClient.on('message', async (topic, buffer) => {
    let payload;
    try {
      payload = JSON.parse(buffer.toString());
    } catch {
      console.warn('[Telemetry] Invalid JSON on topic:', topic);
      return;
    }

    if (topic.includes('/telemetry')) {
      try {
        influx.writeVitals(payload);
        influx.writeActivity(payload);
        influx.writeLocation(payload);
        influx.writeEnvironment(payload);
        await influx.flush();

        await kafkaProducer.publish('silverlink.telemetry', payload);
        console.log(`[Telemetry] Processed telemetry from ${payload.deviceSerial}`);
      } catch (err) {
        console.error('[Telemetry] Error processing telemetry:', err.message);
      }
    }

    if (topic.includes('/alerts')) {
      try {
        await kafkaProducer.publish('silverlink.device-alerts', payload);
        console.log(`[Telemetry] Forwarded device alert: ${payload.alertType} from ${payload.deviceSerial}`);
      } catch (err) {
        console.error('[Telemetry] Error forwarding alert:', err.message);
      }
    }
  });

  mqttClient.on('error', (err) => console.error('[Telemetry] MQTT error:', err.message));
  mqttClient.on('reconnect', () => console.log('[Telemetry] Reconnecting to MQTT...'));

  // Flush InfluxDB every 10s
  setInterval(() => influx.flush().catch(console.error), 10000);
}

start().catch((err) => {
  console.error('[Telemetry] Startup failed:', err);
  process.exit(1);
});
