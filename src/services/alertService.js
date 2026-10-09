const Alert = require('../models/Alert');
const config = require('../../config/default.json');

const inMemoryAlerts = [];

const THRESHOLD_RULES = {
  temperature: {
    threshold: config.monitoring.temperatureMaxThreshold,
    severity: 'CRITICAL',
    isBreached: (value, threshold) => value > threshold
  },
  psi: {
    threshold: config.monitoring.psiMaxThreshold,
    severity: 'WARNING',
    isBreached: (value, threshold) => value > threshold
  },
  voltage: {
    threshold: config.monitoring.voltageMinThreshold,
    severity: 'CRITICAL',
    isBreached: (value, threshold) => value < threshold
  }
};

class AlertService {
  async evaluateMetric(deviceId, metricType, value) {
    const rule = THRESHOLD_RULES[metricType];
    if (!rule || !rule.isBreached(value, rule.threshold)) {
      return null;
    }

    const alert = new Alert({
      alertId: `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceId,
      metricType,
      value,
      threshold: rule.threshold,
      severity: rule.severity
    });
    inMemoryAlerts.push(alert);
    return alert;
  }

  async evaluateBatteryDegradation(deviceId, lowVoltageCount, latestVoltage) {
    const minCount = config.monitoring.batteryDegradedMinCount;
    const threshold = config.monitoring.voltageMinThreshold;

    if (lowVoltageCount <= minCount) {
      return null;
    }

    const openAlert = inMemoryAlerts.find((alert) => (
      alert.deviceId === deviceId
      && alert.metricType === 'BATTERY_DEGRADED'
      && alert.acknowledged === false
    ));
    if (openAlert) {
      return null;
    }

    const alert = new Alert({
      alertId: `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceId,
      metricType: 'BATTERY_DEGRADED',
      value: latestVoltage,
      threshold,
      severity: 'WARNING',
      occurrenceCount: lowVoltageCount
    });
    inMemoryAlerts.push(alert);
    return alert;
  }

  async getAlerts(filter = {}) {
    return inMemoryAlerts.filter(a => {
      if (filter.deviceId && a.deviceId !== filter.deviceId) return false;
      if (filter.severity && a.severity !== filter.severity) return false;
      return true;
    });
  }

  async acknowledgeAlert(alertId) {
    const alert = inMemoryAlerts.find(a => a.alertId === alertId);
    if (alert) {
      alert.acknowledged = true;
      return alert;
    }
    return null;
  }

  // Helper method for test resets
  _clear() {
    inMemoryAlerts.length = 0;
  }
}

module.exports = new AlertService();