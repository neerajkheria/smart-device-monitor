const alertService = require('../../src/services/alertService');

describe('AlertService Unit Tests', () => {
  beforeEach(() => {
    alertService._clear();
  });

  test('should create CRITICAL alert when temperature exceeds 60 degrees', async () => {
    const alert = await alertService.evaluateMetric('DEV-001', 'temperature', 65.5);

    expect(alert).not.toBeNull();
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.metricType).toBe('temperature');
    expect(alert.value).toBe(65.5);
  });

  test('should not trigger alert when temperature is within safe threshold', async () => {
    const alert = await alertService.evaluateMetric('DEV-001', 'temperature', 35.0);
    expect(alert).toBeNull();
  });

  test('should acknowledge an existing alert', async () => {
    const created = await alertService.evaluateMetric('DEV-001', 'psi', 135.0);
    expect(created.acknowledged).toBe(false);

    const acknowledged = await alertService.acknowledgeAlert(created.alertId);
    expect(acknowledged.acknowledged).toBe(true);
  });

  test('does not emit BATTERY_DEGRADED until low samples exceed three', async () => {
    const below = await alertService.evaluateBatteryDegradation('DEV-001', 3, 2.5);
    expect(below).toBeNull();

    const alert = await alertService.evaluateBatteryDegradation('DEV-001', 4, 2.4);
    expect(alert).not.toBeNull();
    expect(alert.metricType).toBe('BATTERY_DEGRADED');
    expect(alert.severity).toBe('WARNING');
    expect(alert.threshold).toBe(2.7);
    expect(alert.value).toBe(2.4);
    expect(alert.occurrenceCount).toBe(4);
  });

  test('suppresses a second BATTERY_DEGRADED alert until the first is acknowledged', async () => {
    const first = await alertService.evaluateBatteryDegradation('DEV-001', 4, 2.4);
    const duplicate = await alertService.evaluateBatteryDegradation('DEV-001', 5, 2.2);
    expect(duplicate).toBeNull();

    await alertService.acknowledgeAlert(first.alertId);
    const next = await alertService.evaluateBatteryDegradation('DEV-001', 4, 2.1);
    expect(next).not.toBeNull();
    expect(next.alertId).not.toBe(first.alertId);

    const stored = await alertService.getAlerts({ deviceId: 'DEV-001' });
    expect(stored.filter((alert) => alert.metricType === 'BATTERY_DEGRADED')).toHaveLength(2);
  });

  test('should trigger CRITICAL alert when voltage drops below 2.7V threshold', async () => {
    const alert = await alertService.evaluateMetric('DEV-CRIT-99', 'voltage', 2.45);
    expect(alert).not.toBeNull();
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.metricType).toBe('voltage');
  });

  // Note: Gaps deliberately left here regarding voltage alerts and boundary values for Lab 2 & Lab 7
});