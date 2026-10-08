// Hardware Abstraction Layer (HAL) Simulator for IoT Sensors
class HalSimulator {
  static readTelemetry(deviceId, deviceType) {
    const baseVoltage = 3.3;
    const jitter = (Math.random() - 0.5) * 0.2;
    const voltage = Number((baseVoltage + jitter).toFixed(2));

    switch (deviceType) {
      case 'THERMAL_SENSOR':
        return {
          voltage,
          temperature: Number((25.0 + Math.random() * 45.0).toFixed(1)),
          unit: 'CELSIUS',
          status: 'ONLINE'
        };
      case 'PRESSURE_VALVE':
        return {
          voltage,
          psi: Number((100.0 + Math.random() * 30.0).toFixed(1)),
          valveState: Math.random() > 0.1 ? 'OPEN' : 'THROTTLED',
          status: 'ONLINE'
        };
      case 'GATEWAY':
        return {
          voltage,
          connectedNodes: Math.floor(Math.random() * 16) + 1,
          throughputMbps: Number((10.0 + Math.random() * 40.0).toFixed(1)),
          status: 'ONLINE'
        };
      default:
        return {
          voltage,
          status: 'STANDBY'
        };
    }
  }
}

module.exports = HalSimulator;