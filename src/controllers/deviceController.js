const deviceService = require('../services/deviceService');

class DeviceController {
  async register(req, res, next) {
    try {
      const device = await deviceService.registerDevice(req.body);
      res.status(201).json({ status: 'success', data: device });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const devices = await deviceService.listDevices();
      res.status(200).json({ status: 'success', results: devices.length, data: devices });
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const device = await deviceService.getDeviceById(req.params.id);
      res.status(200).json({ status: 'success', data: device });
    } catch (err) {
      next(err);
    }
  }

  async getTelemetry(req, res, next) {
    try {
      const telemetry = await deviceService.pollTelemetry(req.params.id);
      res.status(200).json({ status: 'success', data: telemetry });
    } catch (err) {
      next(err);
    }
  }

  async getHealth(req, res, next) {
    try {
      const health = await deviceService.getDeviceHealth(req.params.id);
      res.status(200).json({ status: 'success', data: health });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const device = await deviceService.updateStatus(req.params.id, req.body.status);
      res.status(200).json({ status: 'success', data: device });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DeviceController();