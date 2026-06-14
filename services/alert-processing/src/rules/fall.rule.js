const FALL_IMPACT_THRESHOLD = 15;
const FALL_POST_IMPACT_STILLNESS = 3;

function evaluate(payload) {
  const alerts = [];

  // Device-side fall alert
  if (payload.alertType === 'FALL_DETECTED') {
    alerts.push({
      type: 'FALL',
      severity: 'CRITICAL',
      title: 'Fall Detected',
      description: `Device ${payload.deviceSerial} detected a fall with impact magnitude ${
        payload.data?.impactForce?.toFixed(1) || 'unknown'
      }g`,
      confidence: 0.92,
      metadata: payload.data || {},
    });
  }

  // Server-side fall detection from raw accelerometer telemetry
  if (payload.accelerometer) {
    const { magnitude } = payload.accelerometer;
    if (magnitude > FALL_IMPACT_THRESHOLD) {
      const confidence = Math.min(0.5 + (magnitude - FALL_IMPACT_THRESHOLD) / 40, 0.95);
      alerts.push({
        type: 'FALL',
        severity: magnitude > 25 ? 'CRITICAL' : 'HIGH',
        title: 'Possible Fall Detected (Server)',
        description: `Accelerometer spike of ${magnitude.toFixed(1)}g detected`,
        confidence: Math.round(confidence * 100) / 100,
        metadata: payload.accelerometer,
      });
    }
  }

  return alerts;
}

module.exports = { evaluate };
