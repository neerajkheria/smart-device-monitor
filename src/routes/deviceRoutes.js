const express = require('express');
const deviceController = require('../controllers/deviceController');
const { validateDevicePayload, validateDeviceStatus } = require('../middleware/validateRequest');

const router = express.Router();

router.route('/')
  .get(deviceController.list)
  .post(validateDevicePayload, deviceController.register);

router.route('/:id')
  .get(deviceController.getOne);

router.route('/:id/telemetry')
  .get(deviceController.getTelemetry);

router.route('/:id/health')
  .get(deviceController.getHealth);

router.route('/:id/status')
  .patch(validateDeviceStatus, deviceController.updateStatus);

module.exports = router;