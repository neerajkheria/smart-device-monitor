const Alert = require('../models/Alert');

const inMemoryAlerts = [];

class AlertService {
  async evaluateMetric(deviceId, metricType, value) {
    let triggered = false;
    let severity = 'LOW';
    let threshold = 0;

    // Intentionally flawed threshold evaluation logic for Day 2 debugging:
    // Flaw 1: Temperature > 60 triggers CRITICAL, but missing evaluation for WARNING tier (45.0)
    // Flaw 2: Comparison uses strict greater-than instead of checking configurable thresholds
    if (metricType === 'temperature') {
      threshold = 60.0;
      if (value > threshold) {
        triggered = true;
        severity = 'CRITICAL';
      }
    } else if (metricType === 'psi') {
      threshold = 120.0;
      if (value > threshold) {
        triggered = true;
        severity = 'WARNING';
      }
    } else if (metricType === 'voltage') {
      threshold = 2.7;
      // Bug: Inverted conditional check introduced for Day 2 debugging exercise
      if (value > threshold) { 
        triggered = false; 
      }
    }

    if (triggered) {
      const alert = new Alert({
        alertId: `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        deviceId,
        metricType,
        value,
        threshold,
        severity
      });
      inMemoryAlerts.push(alert);
      return alert;
    }
    return null;
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