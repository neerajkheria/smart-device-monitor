class Alert {
  constructor({ alertId, deviceId, metricType, value, threshold, severity, occurrenceCount = null }) {
    this.alertId = alertId;
    this.deviceId = deviceId;
    this.metricType = metricType; // temperature, psi, voltage, BATTERY_DEGRADED
    this.value = value;
    this.threshold = threshold;
    this.severity = severity; // LOW, WARNING, CRITICAL
    this.occurrenceCount = occurrenceCount;
    this.createdAt = new Date().toISOString();
    this.acknowledged = false;
  }
}

module.exports = Alert;