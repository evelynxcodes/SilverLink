require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const { body, param, validationResult } = require('express-validator');
const authController = require('./controllers/auth.controller');
const elderlyController = require('./controllers/elderly.controller');

const app = express();
const PORT = process.env.USER_PROFILE_PORT || 3004;

app.use(morgan('combined'));
app.use(express.json());

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-profile', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.post('/api/v1/auth/register',
  body('email').isEmail().normalizeEmail(),
  body('phone').isMobilePhone(),
  body('name').isString().trim().notEmpty(),
  body('password').isLength({ min: 8 }),
  validate,
  authController.register
);

app.post('/api/v1/auth/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  authController.login
);

app.post('/api/v1/auth/refresh', authController.refreshToken);

// Elderly profile routes (protected — x-user-id injected by gateway)
app.post('/api/v1/elderly',
  body('name').isString().notEmpty(),
  body('dateOfBirth').isISO8601(),
  validate,
  elderlyController.createElderlyProfile
);

app.get('/api/v1/elderly/mine', elderlyController.getMyElderly);

app.get('/api/v1/elderly/:elderlyId',
  param('elderlyId').isUUID(),
  validate,
  elderlyController.getElderlyProfile
);

app.put('/api/v1/elderly/:elderlyId',
  param('elderlyId').isUUID(),
  validate,
  elderlyController.updateElderlyProfile
);

app.post('/api/v1/elderly/:elderlyId/link-user',
  param('elderlyId').isUUID(),
  body('userId').isUUID(),
  body('relationship').isString().notEmpty(),
  validate,
  elderlyController.linkUser
);

app.use((err, req, res, next) => {
  console.error('[UserProfile] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`[User Profile] Running on port ${PORT}`));
