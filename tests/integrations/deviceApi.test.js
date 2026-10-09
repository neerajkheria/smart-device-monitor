const request = require('supertest');
const app = require('../../src/app');
const deviceService = require('../../src/services/deviceService');

describe('Device REST Endpoints Integration', () => {
  beforeEach(() => {
    deviceService._clear();
  });

  test('GET /health returns 200 and healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('POST /api/v1/devices validates incoming payload', async () => {
    const res = await request(app)
      .post('/api/v1/devices')
      .send({ name: '' });

    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('fail');
  });

  test('POST /api/v1/devices registers new valid device', async () => {
    const res = await request(app)
      .post('/api/v1/devices')
      .send({ name: 'Chiller Sensor 1', type: 'THERMAL_SENSOR', location: 'BASEMENT' });

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('Chiller Sensor 1');
  });

  test('PATCH /api/v1/devices/:id/status updates device status', async () => {
    const device = await deviceService.registerDevice({ name: 'Gateway 1', type: 'GATEWAY' });

    const res = await request(app)
      .patch(`/api/v1/devices/${device.id}/status`)
      .send({ status: 'STANDBY' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('STANDBY');
    expect(res.body.data.id).toBe(device.id);
  });

  test('PATCH /api/v1/devices/:id/status rejects an unknown status', async () => {
    const device = await deviceService.registerDevice({ name: 'Gateway 2', type: 'GATEWAY' });

    const res = await request(app)
      .patch(`/api/v1/devices/${device.id}/status`)
      .send({ status: 'OFFLINE' });

    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('fail');
  });

  test('GET /api/v1/devices/:id/telemetry returns telemetry payload', async () => {
    const device = await deviceService.registerDevice({ name: 'Pressure 1', type: 'PRESSURE_VALVE' });

    const res = await request(app).get(`/api/v1/devices/${device.id}/telemetry`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('voltage');
    expect(res.body.data).toHaveProperty('psi');
  });

  test('GET /api/v1/devices/:id/health returns the rolling health score', async () => {
    const device = await deviceService.registerDevice({ name: 'Gateway 3', type: 'GATEWAY' });

    const res = await request(app).get(`/api/v1/devices/${device.id}/health`);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.deviceId).toBe(device.id);
    expect(res.body.data.healthScore).toBe(100);
    expect(res.body.data.voltageHistory).toEqual([]);
  });

  test('GET /api/v1/devices/:id/health returns 404 for an unknown device', async () => {
    const res = await request(app).get('/api/v1/devices/missing-id/health');
    expect(res.statusCode).toBe(404);
    expect(res.body.status).toBe('fail');
  });
});