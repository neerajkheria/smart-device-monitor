class Device {
  constructor({ id, name, type, location = 'SITE-A', status = 'ACTIVE' }) {
    this.id = id;
    this.name = name;
    this.type = type; // THERMAL_SENSOR, PRESSURE_VALVE, GATEWAY
    this.location = location;
    this.status = status; // ACTIVE, STANDBY, ERROR, MAINTENANCE
    this.registeredAt = new Date().toISOString();
    this.healthScore = 100;
    this.voltageHistory = [];
  }
}

module.exports = Device;