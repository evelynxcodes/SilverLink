const { InfluxDB } = require('@influxdata/influxdb-client');

const client = new InfluxDB({
  url: process.env.INFLUX_HOST || 'http://influxdb:8086',
  token: process.env.INFLUX_TOKEN,
});

const queryApi = client.getQueryApi(process.env.INFLUX_ORG || 'silverlink');

function fluxQuery(query) {
  return new Promise((resolve, reject) => {
    const rows = [];
    queryApi.queryRows(query, {
      next(row, tableMeta) { rows.push(tableMeta.toObject(row)); },
      error(err) { reject(err); },
      complete() { resolve(rows); },
    });
  });
}

async function getVitalsTrend(elderlyId, hours = 24) {
  const query = `
    from(bucket: "${process.env.INFLUX_BUCKET || 'telemetry'}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "vitals" and r.elderlyId == "${elderlyId}")
      |> filter(fn: (r) => r._field == "heartRate" or r._field == "spO2" or r._field == "bodyTemp")
      |> aggregateWindow(every: 30m, fn: mean, createEmpty: false)
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;
  return fluxQuery(query);
}

async function getActivitySummary(elderlyId, days = 7) {
  const query = `
    from(bucket: "${process.env.INFLUX_BUCKET || 'telemetry'}")
      |> range(start: -${days}d)
      |> filter(fn: (r) => r._measurement == "activity" and r.elderlyId == "${elderlyId}")
      |> filter(fn: (r) => r._field == "steps")
      |> aggregateWindow(every: 1d, fn: sum, createEmpty: true)
  `;
  return fluxQuery(query);
}

async function getLocationHistory(elderlyId, hours = 8) {
  const query = `
    from(bucket: "${process.env.INFLUX_BUCKET || 'telemetry'}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "location" and r.elderlyId == "${elderlyId}")
      |> filter(fn: (r) => r._field == "lat" or r._field == "lng")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;
  return fluxQuery(query);
}

async function getEnvironmentHistory(elderlyId, hours = 24) {
  const query = `
    from(bucket: "${process.env.INFLUX_BUCKET || 'telemetry'}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "environment" and r.elderlyId == "${elderlyId}")
      |> filter(fn: (r) => r._field == "roomTemp" or r._field == "humidity" or r._field == "stoveOnMinutes")
      |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  `;
  return fluxQuery(query);
}

module.exports = { getVitalsTrend, getActivitySummary, getLocationHistory, getEnvironmentHistory };
