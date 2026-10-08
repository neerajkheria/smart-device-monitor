const deviceService = require('../src/services/deviceService');
const alertService = require('../src/services/alertService');
const incidentService = require('../src/services/incidentService');
const fixtures = require('../tests/fixtures/deviceData.json');
const logger = require('../src/common/logger');

async function seed() {
  logger.info('Starting database seeding...');
  
  const createdDevices = [];
  for (const item of fixtures) {
    const dev = await deviceService.registerDevice(item);
    createdDevices.push(dev);
    logger.info(`Seeded device: ${dev.name} [${dev.id}]`);
  }

  // Generate an initial alert and incident for seed realism
  const triggerAlert = await alertService.evaluateMetric(createdDevices[0].id, 'temperature', 68.5);
  if (triggerAlert) {
    logger.info(`Seeded alert: ${triggerAlert.alertId} (${triggerAlert.severity})`);
    const incident = await incidentService.createIncident({
      alertId: triggerAlert.alertId,
      deviceId: createdDevices[0].id,
      summary: 'High temperature anomaly detected in Tank 01 during seed execution',
      severity: 'P1'
    });
    logger.info(`Seeded incident: ${incident.incidentId}`);
  }

  logger.info('Seeding finished successfully.');
}

seed().catch(err => {
  logger.error('Seeding failed:', err);
  process.exit(1);
});