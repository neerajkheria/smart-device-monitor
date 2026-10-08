const alertService = require('../services/alertService');
const { NotFoundError } = require('../common/errors');

class AlertController {
  async list(req, res, next) {
    try {
      const alerts = await alertService.getAlerts(req.query);
      res.status(200).json({ status: 'success', results: alerts.length, data: alerts });
    } catch (err) {
      next(err);
    }
  }

  async acknowledge(req, res, next) {
    try {
      const alert = await alertService.acknowledgeAlert(req.params.id);
      if (!alert) {
        throw new NotFoundError(`Alert ${req.params.id} not found.`);
      }
      res.status(200).json({ status: 'success', data: alert });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AlertController();