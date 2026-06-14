require('dotenv').config({ path: '../../.env' });
const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');

const MQTT_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

const SIMULATED_DEVICES = [
  {
    serial: 'SL-WB-2024-001234',
    type: 'WRISTBAND',
    elderlyId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    homeLat: 3.0319,
    homeLng: 101.4434,
  },
  {
    serial: 'SL-HH-2024-005678',
    type: 'HOME_HUB',
    elderlyId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    homeLat: 3.0319,
    homeLng: 101.4434,
  },
];

function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function jitter(base, range) {
  return Math.round((base + (Math.random() * range * 2 - range)) * 10) / 10;
}

function buildVitalsTelemetry(device) {
  return {
    deviceSerial: device.serial,
    elderlyId: device.elderlyId,
    timestamp: new Date().toISOString(),
    type: 'VITALS',
    vitals: {
      heartRate: Math.round(jitter(72, 15)),
      spO2: jitter(97, 2),
      bodyTemp: jitter(36.5, 0.5),
      systolicBP: Math.round(jitter(130, 20)),
      diastolicBP: Math.round(jitter(82, 12)),
    },
    location: {
      lat: jitter(device.homeLat, 0.001),
      lng: jitter(device.homeLng, 0.001),
      accuracy: randomBetween(3, 15),
    },
    activity: {
      steps: Math.round(randomBetween(0, 120)),
      activityLevel: ['SEDENTARY', 'LIGHT', 'MODERATE'][Math.floor(Math.random() * 3)],
      posture: ['SITTING', 'STANDING', 'WALKING'][Math.floor(Math.random() * 3)],
    },
    accelerometer: {
      x: jitter(0, 0.5),
      y: jitter(9.8, 0.5),
      z: jitter(0, 0.5),
      magnitude: jitter(9.8, 0.3),
    },
    device: {
      battery: Math.round(randomBetween(60, 100)),
      signalStrength: Math.round(randomBetween(-90, -50)),
    },
  };
}

function buildEnvironmentTelemetry(device) {
  return {
    deviceSerial: device.serial,
    elderlyId: device.elderlyId,
    timestamp: new Date().toISOString(),
    type: 'ENVIRONMENT',
    environment: {
      roomTemp: jitter(27, 3),
      humidity: jitter(65, 10),
      gasDetected: false,
      smokeDetected: false,
      motionDetected: Math.random() > 0.3,
      doorOpen: Math.random() > 0.8,
      stoveOn: Math.random() > 0.85,
      stoveOnMinutes: Math.random() > 0.85 ? Math.round(randomBetween(1, 45)) : 0,
    },
    device: {
      battery: null,
      signalStrength: Math.round(randomBetween(-70, -40)),
      wifiConnected: true,
    },
  };
}

function simulateFallAlert(device) {
  const impactMagnitude = randomBetween(18, 35);
  return {
    deviceSerial: device.serial,
    elderlyId: device.elderlyId,
    timestamp: new Date().toISOString(),
    alertType: 'FALL_DETECTED',
    severity: 'CRITICAL',
    confirmed: false,
    data: {
      accelerometer: { x: jitter(12, 5), y: -impactMagnitude, z: jitter(8, 4), magnitude: impactMagnitude },
      impactForce: impactMagnitude,
      preImpactPosture: 'WALKING',
    },
    location: {
      lat: jitter(device.homeLat, 0.002),
      lng: jitter(device.homeLng, 0.002),
      accuracy: 8,
    },
  };
}

const client = mqtt.connect(MQTT_URL, {
  clientId: `simulator-${uuidv4()}`,
  username: process.env.MQTT_USERNAME || 'silverlink',
  password: process.env.MQTT_PASSWORD || 'mqtt_secret',
  reconnectPeriod: 5000,
});

client.on('connect', () => {
  console.log(`[Simulator] Connected to MQTT broker at ${MQTT_URL}`);

  SIMULATED_DEVICES.forEach((device) => {
    const telemetryTopic = `silverlink/devices/${device.serial}/telemetry`;
    const alertTopic = `silverlink/devices/${device.serial}/alerts`;

    // Publish telemetry every 30 seconds
    setInterval(() => {
      const payload = device.type === 'HOME_HUB'
        ? buildEnvironmentTelemetry(device)
        : buildVitalsTelemetry(device);

      client.publish(telemetryTopic, JSON.stringify(payload), { qos: 1 }, (err) => {
        if (!err) console.log(`[${device.serial}] Telemetry published (${payload.type})`);
      });
    }, 30000);

    // Simulate random fall event every 5 minutes (dev only)
    if (device.type === 'WRISTBAND') {
      setInterval(() => {
        if (Math.random() < 0.15) {
          const alert = simulateFallAlert(device);
          client.publish(alertTopic, JSON.stringify(alert), { qos: 2 }, (err) => {
            if (!err) console.log(`[${device.serial}] FALL ALERT published!`);
          });
        }
      }, 300000);
    }

    // Initial publish on connect
    setTimeout(() => {
      const payload = device.type === 'HOME_HUB'
        ? buildEnvironmentTelemetry(device)
        : buildVitalsTelemetry(device);
      client.publish(telemetryTopic, JSON.stringify(payload), { qos: 1 });
      console.log(`[${device.serial}] Initial telemetry published`);
    }, 2000);
  });
});

client.on('error', (err) => console.error('[Simulator] MQTT Error:', err.message));
client.on('reconnect', () => console.log('[Simulator] Reconnecting...'));
