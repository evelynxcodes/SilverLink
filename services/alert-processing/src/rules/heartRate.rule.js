const THRESHOLDS = {
  high: { min: 130, severity: 'HIGH' },
  critical_high: { min: 160, severity: 'CRITICAL' },
  low: { max: 45, severity: 'HIGH' },
  critical_low: { max: 35, severity: 'CRITICAL' },
};

const SPO2_LOW = 92;
const SPO2_CRITICAL = 88;

function evaluate(payload) {
  const alerts = [];
  if (!payload.vitals) return alerts;

  const { heartRate, spO2 } = payload.vitals;

  if (heartRate != null) {
    if (heartRate >= THRESHOLDS.critical_high.min) {
      alerts.push({
        type: 'HEART_RATE_HIGH',
        severity: 'CRITICAL',
        title: 'Critically High Heart Rate',
        description: `Heart rate of ${heartRate} bpm — possible cardiac event`,
        confidence: 0.88,
        metadata: { heartRate },
      });
    } else if (heartRate >= THRESHOLDS.high.min) {
      alerts.push({
        type: 'HEART_RATE_HIGH',
        severity: 'HIGH',
        title: 'High Heart Rate',
        description: `Heart rate of ${heartRate} bpm detected`,
        confidence: 0.82,
        metadata: { heartRate },
      });
    } else if (heartRate <= THRESHOLDS.critical_low.max) {
      alerts.push({
        type: 'HEART_RATE_LOW',
        severity: 'CRITICAL',
        title: 'Critically Low Heart Rate (Bradycardia)',
        description: `Heart rate of ${heartRate} bpm — immediate medical attention required`,
        confidence: 0.9,
        metadata: { heartRate },
      });
    } else if (heartRate <= THRESHOLDS.low.max) {
      alerts.push({
        type: 'HEART_RATE_LOW',
        severity: 'HIGH',
        title: 'Low Heart Rate Detected',
        description: `Heart rate of ${heartRate} bpm is below normal range`,
        confidence: 0.78,
        metadata: { heartRate },
      });
    }
  }

  if (spO2 != null) {
    if (spO2 <= SPO2_CRITICAL) {
      alerts.push({
        type: 'SPO2_LOW',
        severity: 'CRITICAL',
        title: 'Critically Low Blood Oxygen',
        description: `SpO2 at ${spO2}% — possible respiratory emergency`,
        confidence: 0.93,
        metadata: { spO2 },
      });
    } else if (spO2 <= SPO2_LOW) {
      alerts.push({
        type: 'SPO2_LOW',
        severity: 'HIGH',
        title: 'Low Blood Oxygen Level',
        description: `SpO2 at ${spO2}% is below safe threshold`,
        confidence: 0.85,
        metadata: { spO2 },
      });
    }
  }

  return alerts;
}

module.exports = { evaluate };
