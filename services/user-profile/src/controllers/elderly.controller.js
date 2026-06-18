const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

async function createElderlyProfile(req, res) {
  const userId = req.headers['x-user-id'];
  const {
    name, nric, dateOfBirth, gender, bloodType,
    medicalConditions, medications, allergies,
    homeAddress, homeLat, homeLng, safeZoneRadius,
    subscriptionTier,
  } = req.body;

  try {
    const elderlyId = uuidv4();
    const result = await pool.query(
      `INSERT INTO elderly_profiles
         (id, name, nric, date_of_birth, gender, blood_type, medical_conditions, medications,
          allergies, home_address, home_lat, home_lng, safe_zone_radius, subscription_tier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        elderlyId, name, nric || null, dateOfBirth, gender || null, bloodType || null,
        JSON.stringify(medicalConditions || []),
        JSON.stringify(medications || []),
        JSON.stringify(allergies || []),
        homeAddress || null, homeLat || null, homeLng || null,
        safeZoneRadius || 200,
        subscriptionTier || 'BASIC',
      ]
    );

    // Auto-link creator as family member
    await pool.query(
      `INSERT INTO user_elderly_links (id, user_id, elderly_profile_id, relationship, can_receive_alerts, alert_priority)
       VALUES ($1,$2,$3,'Primary Contact',true,1)`,
      [uuidv4(), userId, elderlyId]
    );

    res.status(201).json({ elderly: result.rows[0] });
  } catch (err) {
    console.error('[Elderly] createElderlyProfile error:', err);
    res.status(500).json({ error: 'Failed to create elderly profile' });
  }
}

async function getElderlyProfile(req, res) {
  try {
    const result = await pool.query(
      `SELECT ep.*,
              json_agg(DISTINCT jsonb_build_object(
                'userId', uel.user_id, 'relationship', uel.relationship,
                'name', u.name, 'phone', u.phone, 'role', u.role
              )) AS linked_users
       FROM elderly_profiles ep
       LEFT JOIN user_elderly_links uel ON uel.elderly_profile_id = ep.id
       LEFT JOIN users u ON u.id = uel.user_id
       WHERE ep.id = $1 AND ep.is_active = TRUE
       GROUP BY ep.id`,
      [req.params.elderlyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Elderly profile not found' });
    res.json({ elderly: result.rows[0] });
  } catch (err) {
    console.error('[Elderly] getElderlyProfile error:', err);
    res.status(500).json({ error: 'Failed to fetch elderly profile' });
  }
}

async function updateElderlyProfile(req, res) {
  const allowed = ['name', 'medical_conditions', 'medications', 'allergies', 'home_address',
                   'home_lat', 'home_lng', 'safe_zone_radius', 'subscription_tier'];
  const updates = [];
  const params = [];

  Object.entries(req.body).forEach(([key, val]) => {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(col)) {
      updates.push(`${col} = $${params.length + 1}`);
      params.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  });

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  try {
    params.push(req.params.elderlyId);
    const result = await pool.query(
      `UPDATE elderly_profiles SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND is_active = TRUE RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Elderly profile not found' });
    res.json({ elderly: result.rows[0] });
  } catch (err) {
    console.error('[Elderly] updateElderlyProfile error:', err);
    res.status(500).json({ error: 'Failed to update elderly profile' });
  }
}

async function linkUser(req, res) {
  const { userId, relationship, canReceiveAlerts = true, alertPriority = 2 } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_elderly_links (id, user_id, elderly_profile_id, relationship, can_receive_alerts, alert_priority)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, elderly_profile_id) DO UPDATE
       SET relationship = EXCLUDED.relationship`,
      [uuidv4(), userId, req.params.elderlyId, relationship, canReceiveAlerts, alertPriority]
    );
    res.status(201).json({ message: 'User linked successfully' });
  } catch (err) {
    console.error('[Elderly] linkUser error:', err);
    res.status(500).json({ error: 'Failed to link user' });
  }
}

async function getMyElderly(req, res) {
  const userId = req.headers['x-user-id'];
  try {
    const result = await pool.query(
      `SELECT ep.*, uel.relationship, uel.can_receive_alerts, uel.alert_priority
       FROM elderly_profiles ep
       JOIN user_elderly_links uel ON uel.elderly_profile_id = ep.id
       WHERE uel.user_id = $1 AND ep.is_active = TRUE
       ORDER BY uel.alert_priority`,
      [userId]
    );
    res.json({ elderly: result.rows });
  } catch (err) {
    console.error('[Elderly] getMyElderly error:', err);
    res.status(500).json({ error: 'Failed to fetch elderly profiles' });
  }
}

module.exports = { createElderlyProfile, getElderlyProfile, updateElderlyProfile, linkUser, getMyElderly };
