const deviceService = require('../../src/services/deviceService');
const HalSimulator = require('../../src/services/halSimulator');

describe('DeviceService Unit Tests', () => {
  beforeEach(() => {
    deviceService._clear();
  });

  test('should register a new device with default ACTIVE status', async () => {
    const payload = { name: 'Boiler Monitor', type: 'THERMAL_SENSOR', location: 'FACILITY-1' };
    const device = await deviceService.registerDevice(payload);

    expect(device).toHaveProperty('id');
    expect(device.name).toBe(payload.name);
    expect(device.status).toBe('ACTIVE');
    expect(device.healthScore).toBe(100);
  });

  test('should retrieve registered device by ID', async () => {
    const device = await deviceService.registerDevice({ name: 'Valve-9', type: 'PRESSURE_VALVE' });
    const found = await deviceService.getDeviceById(device.id);

    expect(found).toBeDefined();
    expect(found.id).toBe(device.id);
  });

  test('should throw NotFoundError for non-existent device ID', async () => {
    await expect(deviceService.getDeviceById('unknown-uuid')).rejects.toThrow(
      'Device with ID unknown-uuid not found.'
    );
  });

  test('should collect telemetry and record rolling voltage history', async () => {
    jest.spyOn(HalSimulator, 'readTelemetry').mockReturnValue({
      voltage: 3.25,
      temperature: 42.0,
      unit: 'CELSIUS',
      status: 'ONLINE'
    });

    const device = await deviceService.registerDevice({ name: 'Temp-X', type: 'THERMAL_SENSOR' });
    const telemetry = await deviceService.pollTelemetry(device.id);

    expect(telemetry.voltage).toBe(3.25);
    expect(telemetry.temperature).toBe(42.0);
    expect(device.voltageHistory.length).toBe(1);
    expect(device.voltageHistory[0].voltage).toBe(3.25);

    HalSimulator.readTelemetry.mockRestore();
  });
});