const incidentService = require('../services/incidentService');

class IncidentController {
  async create(req, res, next) {
    try {
      const incident = await incidentService.createIncident(req.body);
      res.status(201).json({ status: 'success', data: incident });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const incidents = await incidentService.listIncidents();
      res.status(200).json({ status: 'success', results: incidents.length, data: incidents });
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const incident = await incidentService.getIncidentById(req.params.id);
      res.status(200).json({ status: 'success', data: incident });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { status, note } = req.body;
      const updated = await incidentService.updateStatus(req.params.id, status, note);
      res.status(200).json({ status: 'success', data: updated });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new IncidentController();