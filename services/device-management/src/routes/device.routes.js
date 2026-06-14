const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const controller = require('../controllers/device.controller');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

router.post('/register',
  body('deviceSerial').isString().trim().notEmpty(),
  body('type').isIn(['WRISTBAND', 'HOME_HUB', 'PANIC_BUTTON']),
  body('elderlyProfileId').isUUID(),
  body('maxisSimIccid').optional().isString(),
  validate,
  controller.registerDevice
);

router.get('/:deviceId',
  param('deviceId').isUUID(),
  validate,
  controller.getDevice
);

router.get('/elderly/:elderlyId',
  param('elderlyId').isUUID(),
  validate,
  controller.getDevicesByElderly
);

router.put('/:deviceId/status',
  param('deviceId').isUUID(),
  body('status').isIn(['ONLINE', 'OFFLINE', 'ALERT', 'LOW_BATTERY']),
  validate,
  controller.updateDeviceStatus
);

router.put('/:deviceId/config',
  param('deviceId').isUUID(),
  body('config').isObject(),
  validate,
  controller.updateDeviceConfig
);

router.post('/:deviceId/ota',
  param('deviceId').isUUID(),
  body('targetVersion').isString().matches(/^\d+\.\d+\.\d+$/),
  body('firmwareUrl').isURL(),
  body('checksum').isString().isLength({ min: 64, max: 64 }),
  validate,
  controller.scheduleOta
);

router.get('/:deviceId/ota/status',
  param('deviceId').isUUID(),
  validate,
  controller.getOtaStatus
);

router.delete('/:deviceId',
  param('deviceId').isUUID(),
  validate,
  controller.deactivateDevice
);

module.exports = router;
