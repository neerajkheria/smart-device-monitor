const { v4: uuidv4 } = require('uuid');
const Device = require('../models/Device');
const HalSimulator = require('./halSimulator');
const alertService = require('./alertService');
const { NotFoundError } = require('../common/errors');

const inMemoryDevices = new Map();

class DeviceService {
  async registerDevice(payload) {
    const id = uuidv4();
    const device = new Device({
      id,
      name: payload.name,
      type: payload.type,
      location: payload.location || 'SITE-A',
      status: 'ACTIVE'
    });
    inMemoryDevices.set(id, device);
    return device;
  }

  async getDeviceById(id) {
    const device = inMemoryDevices.get(id);
    if (!device) {
      throw new NotFoundError(`Device with ID ${id} not found.`);
    }
    return device;
  }

  async listDevices() {
    return Array.from(inMemoryDevices.values());
  }

  async pollTelemetry(id) {
    const device = await this.getDeviceById(id);
    const telemetry = HalSimulator.readTelemetry(device.id, device.type);

    // Track rolling voltage history
    device.voltageHistory.push({
      voltage: telemetry.voltage,
      timestamp: new Date().toISOString()
    });
    if (device.voltageHistory.length > 20) {
      device.voltageHistory.shift();
    }

    // Evaluate telemetry metrics against alert rules
    if (telemetry.temperature !== undefined) {
      await alertService.evaluateMetric(device.id, 'temperature', telemetry.temperature);
    }
    if (telemetry.psi !== undefined) {
      await alertService.evaluateMetric(device.id, 'psi', telemetry.psi);
    }
    if (telemetry.voltage !== undefined) {
      await alertService.evaluateMetric(device.id, 'voltage', telemetry.voltage);
    }

    return {
      deviceId: device.id,
      timestamp: new Date().toISOString(),
      ...telemetry
    };
  }

  _clear() {
    inMemoryDevices.clear();
  }
}

module.exports = new DeviceService();