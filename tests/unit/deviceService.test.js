const deviceService = require('../../src/services/deviceService');
const alertService = require('../../src/services/alertService');
const incidentService = require('../../src/services/incidentService');
const HalSimulator = require('../../src/services/halSimulator');
const logger = require('../../src/common/logger');
const config = require('../../config/default.json');

describe('DeviceService Unit Tests', () => {
  beforeEach(() => {
    deviceService._clear();
    alertService._clear();
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

  test('should update a device status', async () => {
    const device = await deviceService.registerDevice({ name: 'Valve-9', type: 'PRESSURE_VALVE' });
    const updated = await deviceService.updateStatus(device.id, 'MAINTENANCE');

    expect(updated.status).toBe('MAINTENANCE');
    expect(updated.id).toBe(device.id);
  });

  test('should throw NotFoundError when updating a missing device', async () => {
    await expect(deviceService.updateStatus('unknown-uuid', 'ERROR')).rejects.toThrow(
      'Device with ID unknown-uuid not found.'
    );
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

  test('maps voltage samples onto a 0-100 health score', async () => {
    const nominal = await deviceService.registerDevice({ name: 'Nominal', type: 'GATEWAY' });
    const floor = await deviceService.registerDevice({ name: 'Floor', type: 'GATEWAY' });
    const mid = await deviceService.registerDevice({ name: 'Mid', type: 'GATEWAY' });
    const below = await deviceService.registerDevice({ name: 'Below', type: 'GATEWAY' });
    const above = await deviceService.registerDevice({ name: 'Above', type: 'GATEWAY' });

    expect(deviceService.calculateHealthScore(nominal, { voltage: 3.3 })).toBe(100);
    expect(deviceService.calculateHealthScore(floor, { voltage: 2.7 })).toBe(0);
    expect(deviceService.calculateHealthScore(mid, { voltage: 3.0 })).toBe(50);
    expect(deviceService.calculateHealthScore(below, { voltage: 2.4 })).toBe(0);
    expect(deviceService.calculateHealthScore(above, { voltage: 3.6 })).toBe(100);
  });

  test('averages in-window voltage scores and drops samples older than five minutes', async () => {
    const device = await deviceService.registerDevice({ name: 'Window', type: 'GATEWAY' });
    device.voltageHistory.push({
      voltage: 2.7,
      timestamp: new Date(Date.now() - config.monitoring.batteryWindowMs - 1000).toISOString()
    });

    const score = deviceService.calculateHealthScore(device, { voltage: 3.3 });

    expect(device.voltageHistory).toHaveLength(1);
    expect(device.voltageHistory[0].voltage).toBe(3.3);
    expect(score).toBe(100);

    deviceService.calculateHealthScore(device, { voltage: 2.7 });
    expect(device.healthScore).toBe(50);
  });

  test('caps voltage history so a fast poll cannot grow it without bound', async () => {
    const device = await deviceService.registerDevice({ name: 'Cap', type: 'GATEWAY' });

    deviceService.calculateHealthScore(device, { voltage: 2.0 });
    for (let i = 0; i < 300; i += 1) {
      deviceService.calculateHealthScore(device, { voltage: 3.3 });
    }

    expect(device.voltageHistory).toHaveLength(300);
    expect(device.voltageHistory.some((sample) => sample.voltage === 2.0)).toBe(false);
    expect(device.healthScore).toBe(100);
  });

  test('four low samples create one BATTERY_DEGRADED alert and a zero health score', async () => {
    jest.spyOn(HalSimulator, 'readTelemetry').mockReturnValue({
      voltage: 2.5,
      temperature: 30.0,
      unit: 'CELSIUS',
      status: 'ONLINE'
    });

    const device = await deviceService.registerDevice({ name: 'Low-V', type: 'THERMAL_SENSOR' });
    for (let i = 0; i < 3; i += 1) {
      await deviceService.pollTelemetry(device.id);
    }

    let alerts = await alertService.getAlerts({ deviceId: device.id });
    expect(alerts.filter((alert) => alert.metricType === 'BATTERY_DEGRADED')).toHaveLength(0);

    await deviceService.pollTelemetry(device.id);

    expect(device.healthScore).toBe(0);
    alerts = await alertService.getAlerts({ deviceId: device.id });
    const batteryAlerts = alerts.filter((alert) => alert.metricType === 'BATTERY_DEGRADED');
    expect(batteryAlerts).toHaveLength(1);
    expect(batteryAlerts[0].severity).toBe('WARNING');
    expect(batteryAlerts[0].occurrenceCount).toBe(4);

    await deviceService.pollTelemetry(device.id);
    alerts = await alertService.getAlerts({ deviceId: device.id });
    expect(alerts.filter((alert) => alert.metricType === 'BATTERY_DEGRADED')).toHaveLength(1);

    HalSimulator.readTelemetry.mockRestore();
  });
});

describe('DeviceService health monitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    deviceService._clear();
    alertService._clear();
  });

  afterEach(() => {
    deviceService.stopHealthMonitor();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('polls each device once per tick and does not evaluate temperature or PSI', async () => {
    const metricSpy = jest.spyOn(alertService, 'evaluateMetric');
    const telemetrySpy = jest.spyOn(HalSimulator, 'readTelemetry').mockReturnValue({
      voltage: 3.3,
      temperature: 90.0,
      unit: 'CELSIUS',
      status: 'ONLINE'
    });

    const first = await deviceService.registerDevice({ name: 'A', type: 'THERMAL_SENSOR' });
    const second = await deviceService.registerDevice({ name: 'B', type: 'GATEWAY' });
    deviceService.startHealthMonitor(60000);

    await jest.advanceTimersByTimeAsync(60000);

    expect(telemetrySpy).toHaveBeenCalledTimes(2);
    expect(telemetrySpy).toHaveBeenCalledWith(first.id, 'THERMAL_SENSOR');
    expect(telemetrySpy).toHaveBeenCalledWith(second.id, 'GATEWAY');
    expect(metricSpy).not.toHaveBeenCalled();
    expect(first.voltageHistory).toHaveLength(1);
    expect(second.healthScore).toBe(100);
  });

  test('stopHealthMonitor clears the interval', async () => {
    const telemetrySpy = jest.spyOn(HalSimulator, 'readTelemetry').mockReturnValue({
      voltage: 3.3,
      status: 'ONLINE'
    });

    await deviceService.registerDevice({ name: 'A', type: 'GATEWAY' });
    deviceService.startHealthMonitor(60000);
    deviceService.stopHealthMonitor();

    await jest.advanceTimersByTimeAsync(120000);

    expect(telemetrySpy).not.toHaveBeenCalled();
  });

  test('a failing device does not block the rest of the tick', async () => {
    const good = await deviceService.registerDevice({ name: 'Good', type: 'GATEWAY' });
    const bad = await deviceService.registerDevice({ name: 'Bad', type: 'GATEWAY' });

    jest.spyOn(HalSimulator, 'readTelemetry').mockImplementation((id) => {
      if (id === bad.id) {
        throw new Error('sensor offline');
      }
      return { voltage: 3.2, status: 'ONLINE' };
    });

    deviceService.startHealthMonitor(60000);
    await jest.advanceTimersByTimeAsync(60000);

    expect(good.voltageHistory).toHaveLength(1);
    expect(bad.voltageHistory).toHaveLength(0);
  });

  test('skips a tick that is still running', async () => {
    await deviceService.registerDevice({ name: 'Slow', type: 'GATEWAY' });
    const telemetrySpy = jest.spyOn(HalSimulator, 'readTelemetry').mockReturnValue({
      voltage: 3.3,
      status: 'ONLINE'
    });

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    jest.spyOn(alertService, 'evaluateBatteryDegradation').mockImplementation(() => gate);

    const firstTick = deviceService.runHealthCheck();
    const skippedTick = deviceService.runHealthCheck();
    release(null);
    await firstTick;
    await skippedTick;

    expect(telemetrySpy).toHaveBeenCalledTimes(1);
  });
});

describe('Emergency telemetry escalation', () => {
  beforeEach(() => {
    deviceService._clear();
    alertService._clear();
    incidentService._clear();
  });

  afterEach(() => {
    deviceService.stopHealthMonitor();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function mockReading(fields) {
    jest.spyOn(HalSimulator, 'readTelemetry').mockReturnValue({
      temperature: 30,
      unit: 'CELSIUS',
      status: 'ONLINE',
      ...fields
    });
  }

  async function openIncidentsFor(deviceId) {
    const incidents = await incidentService.listIncidents();
    return incidents.filter(
      (incident) =>
        incident.deviceId === deviceId &&
        incident.severity === 'P1' &&
        incident.status === 'OPEN'
    );
  }

  test('poll voltage 2.64 opens one P1 and marks the device CRITICAL', async () => {
    mockReading({ voltage: 2.64 });
    const createSpy = jest.spyOn(incidentService, 'createIncident');
    const logSpy = jest.spyOn(logger, 'info');

    const device = await deviceService.registerDevice({ name: 'Low-Poll', type: 'THERMAL_SENSOR' });
    await deviceService.pollTelemetry(device.id);

    expect((await deviceService.getDeviceById(device.id)).status).toBe('CRITICAL');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: device.id,
        severity: 'P1'
      })
    );

    const open = await openIncidentsFor(device.id);
    expect(open).toHaveLength(1);
    expect(logSpy).toHaveBeenCalledWith(
      'Emergency telemetry escalation',
      expect.objectContaining({
        deviceId: device.id,
        voltage: 2.64
      })
    );
  });

  test('health tick escalates voltage 2.64 and does not evaluate metrics', async () => {
    jest.useFakeTimers();
    mockReading({ voltage: 2.64, temperature: 90 });
    const metricSpy = jest.spyOn(alertService, 'evaluateMetric');
    const logSpy = jest.spyOn(logger, 'info');

    const device = await deviceService.registerDevice({ name: 'Low-Tick', type: 'THERMAL_SENSOR' });
    deviceService.startHealthMonitor(60000);
    await jest.advanceTimersByTimeAsync(60000);

    expect((await deviceService.getDeviceById(device.id)).status).toBe('CRITICAL');
    expect(metricSpy).not.toHaveBeenCalled();
    expect(await openIncidentsFor(device.id)).toHaveLength(1);
    expect(logSpy).toHaveBeenCalledWith(
      'Emergency telemetry escalation',
      expect.objectContaining({
        deviceId: device.id,
        voltage: 2.64
      })
    );
  });

  test('exact 2.65V does not escalate', async () => {
    mockReading({ voltage: 2.65 });
    const createSpy = jest.spyOn(incidentService, 'createIncident');
    const logSpy = jest.spyOn(logger, 'info');

    const device = await deviceService.registerDevice({ name: 'Exact', type: 'THERMAL_SENSOR' });
    await deviceService.pollTelemetry(device.id);

    expect((await deviceService.getDeviceById(device.id)).status).toBe('ACTIVE');
    expect(createSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith(
      'Emergency telemetry escalation',
      expect.anything()
    );
  });

  test('2.649V escalates', async () => {
    mockReading({ voltage: 2.649 });
    const device = await deviceService.registerDevice({ name: 'Just-Under', type: 'GATEWAY' });
    await deviceService.pollTelemetry(device.id);

    expect((await deviceService.getDeviceById(device.id)).status).toBe('CRITICAL');
    const open = await openIncidentsFor(device.id);
    expect(open).toHaveLength(1);
    expect(open[0].severity).toBe('P1');
  });

  test('2.66V and 2.7V do not escalate', async () => {
    const readSpy = jest.spyOn(HalSimulator, 'readTelemetry');
    readSpy
      .mockReturnValueOnce({ voltage: 2.66, temperature: 30, status: 'ONLINE' })
      .mockReturnValueOnce({ voltage: 2.7, temperature: 30, status: 'ONLINE' });
    const createSpy = jest.spyOn(incidentService, 'createIncident');

    const near = await deviceService.registerDevice({ name: 'Near', type: 'GATEWAY' });
    const floor = await deviceService.registerDevice({ name: 'Floor', type: 'GATEWAY' });
    await deviceService.pollTelemetry(near.id);
    await deviceService.pollTelemetry(floor.id);

    expect((await deviceService.getDeviceById(near.id)).status).toBe('ACTIVE');
    expect((await deviceService.getDeviceById(floor.id)).status).toBe('ACTIVE');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('missing device does not create an incident', async () => {
    const createSpy = jest.spyOn(incidentService, 'createIncident');

    await expect(deviceService.pollTelemetry('unknown-uuid')).rejects.toThrow(
      'Device with ID unknown-uuid not found.'
    );
    expect(createSpy).not.toHaveBeenCalled();
    expect(await incidentService.listIncidents()).toHaveLength(0);
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['NaN', NaN],
    ['a non-numeric string', '2.4'],
    ['Infinity', Infinity]
  ])('does not escalate when voltage is %s', async (_label, voltage) => {
    mockReading({ voltage });
    const createSpy = jest.spyOn(incidentService, 'createIncident');

    const device = await deviceService.registerDevice({
      name: `Non-numeric-${_label}`,
      type: 'THERMAL_SENSOR'
    });
    await deviceService.pollTelemetry(device.id);

    expect((await deviceService.getDeviceById(device.id)).status).toBe('ACTIVE');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('an already CRITICAL device opens only one P1 across two low polls', async () => {
    mockReading({ voltage: 2.64 });
    const createSpy = jest.spyOn(incidentService, 'createIncident');
    const logSpy = jest.spyOn(logger, 'info');

    const device = await deviceService.registerDevice({ name: 'Already', type: 'THERMAL_SENSOR' });
    await deviceService.updateStatus(device.id, 'CRITICAL');
    await deviceService.pollTelemetry(device.id);
    await deviceService.pollTelemetry(device.id);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: device.id,
        severity: 'P1'
      })
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((await deviceService.getDeviceById(device.id)).status).toBe('CRITICAL');
    expect(await openIncidentsFor(device.id)).toHaveLength(1);
  });

  test('two polls at 2.64V leave a single OPEN P1', async () => {
    mockReading({ voltage: 2.64 });

    const device = await deviceService.registerDevice({ name: 'Dup', type: 'PRESSURE_VALVE' });
    await deviceService.pollTelemetry(device.id);
    await deviceService.pollTelemetry(device.id);

    expect((await deviceService.getDeviceById(device.id)).status).toBe('CRITICAL');
    expect(await openIncidentsFor(device.id)).toHaveLength(1);
  });

  test('a thrown audit log still resolves the poll and keeps the P1', async () => {
    mockReading({ voltage: 2.64 });
    jest.spyOn(logger, 'info').mockImplementation(() => {
      throw new Error('log down');
    });

    const device = await deviceService.registerDevice({ name: 'Log-Fail', type: 'THERMAL_SENSOR' });
    const telemetry = await deviceService.pollTelemetry(device.id);

    expect(telemetry.voltage).toBe(2.64);
    expect((await deviceService.getDeviceById(device.id)).status).toBe('CRITICAL');
    expect(await openIncidentsFor(device.id)).toHaveLength(1);
  });

  test('a rejected createIncident leaves the device ACTIVE', async () => {
    mockReading({ voltage: 2.64 });
    jest.spyOn(incidentService, 'createIncident').mockRejectedValue(new Error('incident store down'));

    const device = await deviceService.registerDevice({ name: 'Store-Fail', type: 'THERMAL_SENSOR' });
    await expect(deviceService.pollTelemetry(device.id)).rejects.toThrow('incident store down');

    expect((await deviceService.getDeviceById(device.id)).status).toBe('ACTIVE');
    expect(await incidentService.listIncidents()).toHaveLength(0);
  });

  test('healthy voltage with a high temperature does not escalate', async () => {
    mockReading({ voltage: 3.3, temperature: 90 });
    const createSpy = jest.spyOn(incidentService, 'createIncident');

    const device = await deviceService.registerDevice({ name: 'Hot', type: 'THERMAL_SENSOR' });
    await deviceService.pollTelemetry(device.id);

    expect((await deviceService.getDeviceById(device.id)).status).toBe('ACTIVE');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('a MAINTENANCE device stays MAINTENANCE at 3.3V', async () => {
    mockReading({ voltage: 3.3 });
    const createSpy = jest.spyOn(incidentService, 'createIncident');

    const device = await deviceService.registerDevice({ name: 'Maint', type: 'GATEWAY' });
    await deviceService.updateStatus(device.id, 'MAINTENANCE');
    await deviceService.pollTelemetry(device.id);

    expect((await deviceService.getDeviceById(device.id)).status).toBe('MAINTENANCE');
    expect(createSpy).not.toHaveBeenCalled();
  });
});