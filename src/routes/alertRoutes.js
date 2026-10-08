const express = require('express');
const alertController = require('../controllers/alertController');

const router = express.Router();

router.route('/')
  .get(alertController.list);

router.route('/:id/acknowledge')
  .patch(alertController.acknowledge);

module.exports = router;