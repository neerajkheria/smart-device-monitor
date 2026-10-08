const express = require('express');
const deviceController = require('../controllers/deviceController');
const { validateDevicePayload } = require('../middleware/validateRequest');

const router = express.Router();

router.route('/')
  .get(deviceController.list)
  .post(validateDevicePayload, deviceController.register);

router.route('/:id')
  .get(deviceController.getOne);

router.route('/:id/telemetry')
  .get(deviceController.getTelemetry);

module.exports = router;