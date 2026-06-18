const { InfluxDB, Point } = require('@influxdata/influxdb-client');

const client = new InfluxDB({
  url: process.env.INFLUX_HOST || 'http://influxdb:8086',
  token: process.env.INFLUX_TOKEN,
});

const writeApi = client.getWriteApi(
  process.env.INFLUX_ORG || 'silverlink',
  process.env.INFLUX_BUCKET || 'telemetry',
  'ns'
);

function writeVitals(payload) {
  if (!payload.vitals) return;
  const { vitals, device, elderlyId, deviceSerial } = payload;
  const ts = new Date(payload.timestamp);

  const point = new Point('vitals')
    .tag('elderlyId', elderlyId)
    .tag('deviceSerial', deviceSerial)
    .timestamp(ts);

  if (vitals.heartRate != null) point.intField('heartRate', vitals.heartRate);
  if (vitals.spO2 != null) point.floatField('spO2', vitals.spO2);
  if (vitals.bodyTemp != null) point.floatField('bodyTemp', vitals.bodyTemp);
  if (vitals.systolicBP != null) point.intField('systolicBP', vitals.systolicBP);
  if (vitals.diastolicBP != null) point.intField('diastolicBP', vitals.diastolicBP);
  if (device?.battery != null) point.intField('battery', device.battery);

  writeApi.writePoint(point);
}

function writeActivity(payload) {
  if (!payload.activity) return;
  const { activity, elderlyId, deviceSerial } = payload;
  const ts = new Date(payload.timestamp);

  const point = new Point('activity')
    .tag('elderlyId', elderlyId)
    .tag('deviceSerial', deviceSerial)
    .tag('activityLevel', activity.activityLevel || 'UNKNOWN')
    .tag('posture', activity.posture || 'UNKNOWN')
    .timestamp(ts);

  if (activity.steps != null) point.intField('steps', activity.steps);
  if (activity.activeMinutes != null) point.intField('activeMinutes', activity.activeMinutes);
  if (activity.calories != null) point.floatField('calories', activity.calories);

  writeApi.writePoint(point);
}

function writeLocation(payload) {
  if (!payload.location) return;
  const { location, elderlyId, deviceSerial } = payload;
  const ts = new Date(payload.timestamp);

  const point = new Point('location')
    .tag('elderlyId', elderlyId)
    .tag('deviceSerial', deviceSerial)
    .floatField('lat', location.lat)
    .floatField('lng', location.lng)
    .timestamp(ts);

  if (location.accuracy != null) point.floatField('accuracy', location.accuracy);
  if (location.speed != null) point.floatField('speed', location.speed);

  writeApi.writePoint(point);
}

function writeEnvironment(payload) {
  if (!payload.environment) return;
  const { environment, elderlyId, deviceSerial } = payload;
  const ts = new Date(payload.timestamp);

  const point = new Point('environment')
    .tag('elderlyId', elderlyId)
    .tag('deviceSerial', deviceSerial)
    .timestamp(ts);

  if (environment.roomTemp != null) point.floatField('roomTemp', environment.roomTemp);
  if (environment.humidity != null) point.floatField('humidity', environment.humidity);
  if (environment.gasDetected != null) point.booleanField('gasDetected', environment.gasDetected);
  if (environment.smokeDetected != null) point.booleanField('smokeDetected', environment.smokeDetected);
  if (environment.motionDetected != null) point.booleanField('motionDetected', environment.motionDetected);
  if (environment.doorOpen != null) point.booleanField('doorOpen', environment.doorOpen);
  if (environment.stoveOn != null) point.booleanField('stoveOn', environment.stoveOn);
  if (environment.stoveOnMinutes != null) point.intField('stoveOnMinutes', environment.stoveOnMinutes);

  writeApi.writePoint(point);
}

async function flush() {
  await writeApi.flush();
}

module.exports = { writeVitals, writeActivity, writeLocation, writeEnvironment, flush };
