const { v4: uuidv4 } = require('uuid');
const Device = require('../models/Device');
const HalSimulator = require('./halSimulator');
const alertService = require('./alertService');
const logger = require('../common/logger');
const { NotFoundError } = require('../common/errors');
const config = require('../../config/default.json');

const inMemoryDevices = new Map();
const VOLTAGE_HISTORY_CAP = 300;

class DeviceService {
  constructor() {
    this._healthTimer = null;
    this._healthTickInFlight = false;
  }

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

  async updateStatus(id, status) {
    const device = await this.getDeviceById(id);
    device.status = status;
    return device;
  }

  async getDeviceHealth(id) {
    const device = await this.getDeviceById(id);
    return {
      deviceId: device.id,
      healthScore: device.healthScore,
      voltageHistory: device.voltageHistory
    };
  }

  /**
   * Append one voltage sample, drop readings outside the battery window,
   * and store the integer average health score (0–100) on the device.
   */
  calculateHealthScore(device, telemetry) {
    if (telemetry && Number.isFinite(telemetry.voltage)) {
      device.voltageHistory.push({
        voltage: telemetry.voltage,
        timestamp: new Date().toISOString()
      });
    }

    this._pruneVoltageHistory(device);

    if (device.voltageHistory.length === 0) {
      device.healthScore = 100;
      return device.healthScore;
    }

    const total = device.voltageHistory.reduce(
      (sum, sample) => sum + this._voltageToScore(sample.voltage),
      0
    );
    device.healthScore = Math.round(total / device.voltageHistory.length);
    return device.healthScore;
  }

  async pollTelemetry(id) {
    const device = await this.getDeviceById(id);
    const telemetry = HalSimulator.readTelemetry(device.id, device.type);

    await this._commitHealthSample(device, telemetry);

    // Evaluate telemetry metrics against alert rules.
    // The health monitor does not use this path.
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

  startHealthMonitor(intervalMs) {
    this.stopHealthMonitor();
    const period = intervalMs || config.monitoring.telemetryIntervalMs;
    this._healthTimer = setInterval(() => {
      this.runHealthCheck();
    }, period);
    return this._healthTimer;
  }

  stopHealthMonitor() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  async runHealthCheck() {
    if (this._healthTickInFlight) {
      return;
    }

    this._healthTickInFlight = true;
    try {
      const devices = await this.listDevices();
      for (const device of devices) {
        try {
          const telemetry = HalSimulator.readTelemetry(device.id, device.type);
          await this._commitHealthSample(device, telemetry);
        } catch (err) {
          logger.error(`Health monitor skipped device ${device.id}: ${err.message}`);
        }
      }
    } finally {
      this._healthTickInFlight = false;
    }
  }

  async _commitHealthSample(device, telemetry) {
    const healthScore = this.calculateHealthScore(device, telemetry);
    const lowVoltageCount = device.voltageHistory.filter(
      (sample) => sample.voltage < config.monitoring.voltageMinThreshold
    ).length;

    await alertService.evaluateBatteryDegradation(
      device.id,
      lowVoltageCount,
      telemetry.voltage
    );

    return healthScore;
  }

  _voltageToScore(voltage) {
    const minVoltage = config.monitoring.voltageMinThreshold;
    const nominalVoltage = config.monitoring.nominalVoltage;
    const raw = ((voltage - minVoltage) / (nominalVoltage - minVoltage)) * 100;
    if (raw < 0) {
      return 0;
    }
    if (raw > 100) {
      return 100;
    }
    return raw;
  }

  _pruneVoltageHistory(device) {
    const cutoff = Date.now() - config.monitoring.batteryWindowMs;
    device.voltageHistory = device.voltageHistory.filter(
      (sample) => new Date(sample.timestamp).getTime() >= cutoff
    );
    if (device.voltageHistory.length > VOLTAGE_HISTORY_CAP) {
      device.voltageHistory = device.voltageHistory.slice(-VOLTAGE_HISTORY_CAP);
    }
  }

  _clear() {
    this.stopHealthMonitor();
    inMemoryDevices.clear();
  }
}

module.exports = new DeviceService();
