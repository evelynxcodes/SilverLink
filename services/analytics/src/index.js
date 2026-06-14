require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const { Pool } = require('pg');
const { param, query, validationResult } = require('express-validator');
const influx = require('./influx/queries');

const app = express();
const PORT = process.env.ANALYTICS_PORT || 3006;

app.use(morgan('combined'));
app.use(express.json());

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  max: 10,
});

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'analytics', timestamp: new Date().toISOString() });
});

app.get('/api/v1/analytics/:elderlyId/vitals',
  param('elderlyId').isUUID(),
  query('hours').optional().isInt({ min: 1, max: 168 }),
  validate,
  async (req, res) => {
    try {
      const data = await influx.getVitalsTrend(req.params.elderlyId, parseInt(req.query.hours || 24));
      res.json({ elderlyId: req.params.elderlyId, vitals: data });
    } catch (err) {
      console.error('[Analytics] vitals error:', err);
      res.status(500).json({ error: 'Failed to fetch vitals trend' });
    }
  }
);

app.get('/api/v1/analytics/:elderlyId/activity',
  param('elderlyId').isUUID(),
  query('days').optional().isInt({ min: 1, max: 30 }),
  validate,
  async (req, res) => {
    try {
      const data = await influx.getActivitySummary(req.params.elderlyId, parseInt(req.query.days || 7));
      res.json({ elderlyId: req.params.elderlyId, activity: data });
    } catch (err) {
      console.error('[Analytics] activity error:', err);
      res.status(500).json({ error: 'Failed to fetch activity summary' });
    }
  }
);

app.get('/api/v1/analytics/:elderlyId/location',
  param('elderlyId').isUUID(),
  query('hours').optional().isInt({ min: 1, max: 48 }),
  validate,
  async (req, res) => {
    try {
      const data = await influx.getLocationHistory(req.params.elderlyId, parseInt(req.query.hours || 8));
      res.json({ elderlyId: req.params.elderlyId, locationTrail: data });
    } catch (err) {
      console.error('[Analytics] location error:', err);
      res.status(500).json({ error: 'Failed to fetch location history' });
    }
  }
);

app.get('/api/v1/analytics/:elderlyId/risk-score',
  param('elderlyId').isUUID(),
  validate,
  async (req, res) => {
    try {
      const { elderlyId } = req.params;

      const [alertStats, profile] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE triggered_at > NOW() - INTERVAL '7 days') AS alerts_7d,
             COUNT(*) FILTER (WHERE severity = 'CRITICAL' AND triggered_at > NOW() - INTERVAL '7 days') AS critical_7d,
             COUNT(*) FILTER (WHERE type = 'FALL' AND triggered_at > NOW() - INTERVAL '30 days') AS falls_30d
           FROM alerts WHERE elderly_profile_id = $1`,
          [elderlyId]
        ),
        pool.query('SELECT medical_conditions, date_of_birth FROM elderly_profiles WHERE id = $1', [elderlyId]),
      ]);

      const stats = alertStats.rows[0];
      const ep = profile.rows[0];
      const age = ep ? Math.floor((Date.now() - new Date(ep.date_of_birth)) / (365.25 * 24 * 3600 * 1000)) : 75;
      const conditions = ep?.medical_conditions || [];
      const numConditions = Array.isArray(conditions) ? conditions.length : 0;

      const ageScore = Math.min((Math.max(age - 60, 0) / 30) * 30, 30);
      const conditionScore = Math.min(numConditions * 10, 25);
      const alertScore = Math.min(parseInt(stats.alerts_7d) * 3 + parseInt(stats.critical_7d) * 8, 30);
      const fallScore = Math.min(parseInt(stats.falls_30d) * 10, 15);
      const total = Math.round(ageScore + conditionScore + alertScore + fallScore);

      const level = total < 25 ? 'LOW' : total < 50 ? 'MEDIUM' : total < 75 ? 'HIGH' : 'CRITICAL';

      res.json({
        elderlyId,
        riskScore: total,
        riskLevel: level,
        breakdown: { ageScore, conditionScore, alertScore, fallScore },
        stats: { alerts7d: parseInt(stats.alerts_7d), critical7d: parseInt(stats.critical_7d), falls30d: parseInt(stats.falls_30d) },
        recommendations: getRiskRecommendations(level),
      });
    } catch (err) {
      console.error('[Analytics] risk-score error:', err);
      res.status(500).json({ error: 'Failed to compute risk score' });
    }
  }
);

function getRiskRecommendations(level) {
  const recs = {
    LOW: ['Continue routine health monitoring', 'Schedule regular health check-ups'],
    MEDIUM: ['Increase alert sensitivity', 'Review medication compliance', 'Consider adding a daily check-in call'],
    HIGH: ['Assign dedicated caregiver', 'Review and update emergency contacts', 'Consider medical review', 'Increase safe zone checks'],
    CRITICAL: ['Immediate medical consultation recommended', 'Activate 24/7 monitoring', 'Alert primary care physician', 'Review emergency response plan'],
  };
  return recs[level] || [];
}

app.listen(PORT, () => console.log(`[Analytics] Running on port ${PORT}`));
