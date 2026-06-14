const pool = require('../db');
const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
const semver = require('semver');

let mqttClient = null;

function getMqttClient() {
  if (!mqttClient || !mqttClient.connected) {
    mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
      clientId: `device-mgmt-${uuidv4()}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });
  }
  return mqttClient;
}

async function registerDevice(req, res) {
  const { deviceSerial, type, elderlyProfileId, maxisSimIccid } = req.body;
  try {
    const existing = await pool.query(
      'SELECT id FROM devices WHERE device_serial = $1',
      [deviceSerial]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Device already registered' });
    }

    const result = await pool.query(
      `INSERT INTO devices (id, device_serial, type, elderly_profile_id, maxis_sim_iccid)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [uuidv4(), deviceSerial, type, elderlyProfileId, maxisSimIccid || null]
    );

    res.status(201).json({ device: result.rows[0] });
  } catch (err) {
    console.error('[DeviceMgmt] registerDevice error:', err);
    res.status(500).json({ error: 'Failed to register device' });
  }
}

async function getDevice(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM devices WHERE id = $1 AND is_active = TRUE',
      [req.params.deviceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ device: result.rows[0] });
  } catch (err) {
    console.error('[DeviceMgmt] getDevice error:', err);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
}

async function getDevicesByElderly(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM devices WHERE elderly_profile_id = $1 AND is_active = TRUE ORDER BY type',
      [req.params.elderlyId]
    );
    res.json({ devices: result.rows });
  } catch (err) {
    console.error('[DeviceMgmt] getDevicesByElderly error:', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
}

async function updateDeviceStatus(req, res) {
  const { status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE devices SET status = $1, last_seen_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND is_active = TRUE RETURNING *`,
      [status, req.params.deviceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ device: result.rows[0] });
  } catch (err) {
    console.error('[DeviceMgmt] updateDeviceStatus error:', err);
    res.status(500).json({ error: 'Failed to update device status' });
  }
}

async function updateDeviceConfig(req, res) {
  const { config } = req.body;
  try {
    const result = await pool.query(
      `UPDATE devices SET config = $1, updated_at = NOW()
       WHERE id = $2 AND is_active = TRUE RETURNING *`,
      [JSON.stringify(config), req.params.deviceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

    const device = result.rows[0];
    const client = getMqttClient();
    client.publish(
      `silverlink/devices/${device.device_serial}/config`,
      JSON.stringify(config),
      { qos: 1 }
    );

    res.json({ device });
  } catch (err) {
    console.error('[DeviceMgmt] updateDeviceConfig error:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
}

async function scheduleOta(req, res) {
  const { targetVersion, firmwareUrl, checksum } = req.body;
  try {
    const deviceResult = await pool.query(
      'SELECT * FROM devices WHERE id = $1 AND is_active = TRUE',
      [req.params.deviceId]
    );
    if (deviceResult.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

    const device = deviceResult.rows[0];
    if (!semver.gt(targetVersion, device.firmware_version)) {
      return res.status(400).json({
        error: `Target version ${targetVersion} must be greater than current ${device.firmware_version}`,
      });
    }

    const otaResult = await pool.query(
      `INSERT INTO ota_jobs (id, device_id, target_version, firmware_url, checksum, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING *`,
      [uuidv4(), device.id, targetVersion, firmwareUrl, checksum]
    );

    const client = getMqttClient();
    client.publish(
      `silverlink/devices/${device.device_serial}/ota`,
      JSON.stringify({ jobId: otaResult.rows[0].id, targetVersion, firmwareUrl, checksum }),
      { qos: 2 }
    );

    res.status(202).json({ otaJob: otaResult.rows[0] });
  } catch (err) {
    console.error('[DeviceMgmt] scheduleOta error:', err);
    res.status(500).json({ error: 'Failed to schedule OTA update' });
  }
}

async function getOtaStatus(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM ota_jobs WHERE device_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [req.params.deviceId]
    );
    res.json({ otaJobs: result.rows });
  } catch (err) {
    console.error('[DeviceMgmt] getOtaStatus error:', err);
    res.status(500).json({ error: 'Failed to fetch OTA status' });
  }
}

async function deactivateDevice(req, res) {
  try {
    const result = await pool.query(
      `UPDATE devices SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 RETURNING id, device_serial, type`,
      [req.params.deviceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device deactivated', device: result.rows[0] });
  } catch (err) {
    console.error('[DeviceMgmt] deactivateDevice error:', err);
    res.status(500).json({ error: 'Failed to deactivate device' });
  }
}

module.exports = {
  registerDevice,
  getDevice,
  getDevicesByElderly,
  updateDeviceStatus,
  updateDeviceConfig,
  scheduleOta,
  getOtaStatus,
  deactivateDevice,
};
