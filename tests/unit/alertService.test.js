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

  // Note: Gaps deliberately left here regarding voltage alerts and boundary values for Lab 2 & Lab 7
});