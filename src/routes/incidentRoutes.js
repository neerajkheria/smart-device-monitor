const express = require('express');
const incidentController = require('../controllers/incidentController');
const { validateIncidentStatus } = require('../middleware/validateRequest');

const router = express.Router();

router.route('/')
  .get(incidentController.list)
  .post(incidentController.create);

router.route('/:id')
  .get(incidentController.getOne);

router.route('/:id/status')
  .patch(validateIncidentStatus, incidentController.update);

module.exports = router;