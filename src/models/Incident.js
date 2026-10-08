class Incident {
  constructor({ incidentId, alertId, deviceId, summary, severity }) {
    this.incidentId = incidentId;
    this.alertId = alertId;
    this.deviceId = deviceId;
    this.summary = summary;
    this.severity = severity; // P1, P2, P3
    this.status = 'OPEN'; // OPEN, INVESTIGATING, RESOLVED, CLOSED
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.notes = [];
  }
}

module.exports = Incident;