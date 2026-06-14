const pool = require('../db');

const INACTIVITY_THRESHOLD_MINUTES = 120;
const NIGHT_DOOR_HOURS = { start: 22, end: 6 };
const STOVE_ON_THRESHOLD_MINUTES = 60;

function isNightHour() {
  const h = new Date().getHours();
  return h >= NIGHT_DOOR_HOURS.start || h < NIGHT_DOOR_HOURS.end;
}

async function evaluate(payload, elderlyProfile) {
  const alerts = [];

  // Stove left on too long
  if (payload.environment?.stoveOn && payload.environment?.stoveOnMinutes >= STOVE_ON_THRESHOLD_MINUTES) {
    alerts.push({
      type: 'STOVE_ON',
      severity: payload.environment.stoveOnMinutes > 120 ? 'HIGH' : 'MEDIUM',
      title: 'Stove Left On',
      description: `Stove has been on for ${payload.environment.stoveOnMinutes} minutes`,
      confidence: 0.95,
      metadata: { stoveOnMinutes: payload.environment.stoveOnMinutes },
    });
  }

  // Door open at night
  if (payload.environment?.doorOpen && isNightHour()) {
    alerts.push({
      type: 'DOOR_OPEN_NIGHT',
      severity: 'MEDIUM',
      title: 'Door Opened During Night',
      description: 'Main door opened outside normal hours — possible wandering',
      confidence: 0.7,
      metadata: { doorOpen: true, hour: new Date().getHours() },
    });
  }

  // Wandering detection (outside geofence)
  if (payload.location && elderlyProfile) {
    const { lat, lng } = payload.location;
    const homeLat = elderlyProfile.home_lat;
    const homeLng = elderlyProfile.home_lng;
    const safeRadius = elderlyProfile.safe_zone_radius || 200;

    if (homeLat && homeLng) {
      const distance = haversineMeters(lat, lng, homeLat, homeLng);
      if (distance > safeRadius) {
        alerts.push({
          type: 'WANDERING',
          severity: distance > safeRadius * 3 ? 'CRITICAL' : 'HIGH',
          title: 'Wandering Alert',
          description: `Elderly is ${Math.round(distance)}m from home — outside safe zone`,
          confidence: 0.87,
          metadata: { distance: Math.round(distance), lat, lng, homeLat, homeLng, safeRadius },
        });
      }
    }
  }

  return alerts;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { evaluate };
