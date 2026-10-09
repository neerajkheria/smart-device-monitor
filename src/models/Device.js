class Device {
  constructor({ id, name, type, location = 'SITE-A', status = 'ACTIVE' }) {
    this.id = id;
    this.name = name;
    this.type = type; // THERMAL_SENSOR, PRESSURE_VALVE, GATEWAY
    this.location = location;
    this.status = status; // ACTIVE, STANDBY, ERROR, MAINTENANCE, CRITICAL
    this.registeredAt = new Date().toISOString();
    // Integer 0–100. Stays 100 until the first voltage sample, then the
    // service recomputes it from voltageHistory.
    this.healthScore = 100;
    // Rolling { voltage, timestamp } samples inside the battery window.
    this.voltageHistory = [];
  }
}

module.exports = Device;