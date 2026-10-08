class Alert {
  constructor({ alertId, deviceId, metricType, value, threshold, severity }) {
    this.alertId = alertId;
    this.deviceId = deviceId;
    this.metricType = metricType;
    this.value = value;
    this.threshold = threshold;
    this.severity = severity; // LOW, WARNING, CRITICAL
    this.createdAt = new Date().toISOString();
    this.acknowledged = false;
  }
}

module.exports = Alert;