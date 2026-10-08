const Incident = require('../models/Incident');
const { NotFoundError } = require('../common/errors');

const inMemoryIncidents = new Map();

class IncidentService {
  async createIncident({ alertId, deviceId, summary, severity = 'P2' }) {
    const incidentId = `INC-${Date.now()}`;
    const incident = new Incident({
      incidentId,
      alertId,
      deviceId,
      summary,
      severity
    });
    inMemoryIncidents.set(incidentId, incident);
    return incident;
  }

  async getIncidentById(incidentId) {
    const incident = inMemoryIncidents.get(incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${incidentId} not found.`);
    }
    return incident;
  }

  async updateStatus(incidentId, status, note = null) {
    const incident = await this.getIncidentById(incidentId);
    incident.status = status;
    incident.updatedAt = new Date().toISOString();
    if (note) {
      incident.notes.push({
        text: note,
        timestamp: new Date().toISOString()
      });
    }
    return incident;
  }

  async listIncidents() {
    return Array.from(inMemoryIncidents.values());
  }

  _clear() {
    inMemoryIncidents.clear();
  }
}

module.exports = new IncidentService();