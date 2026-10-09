const app = require('./app');
const logger = require('./common/logger');
const config = require('../config/default.json');
const deviceService = require('./services/deviceService');

const PORT = process.env.PORT || config.server.port || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Smart Device Monitoring Platform running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  deviceService.startHealthMonitor(config.monitoring.telemetryIntervalMs);
});

// Process signal handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully.');
  deviceService.stopHealthMonitor();
  server.close(() => {
    logger.info('Process terminated.');
  });
});

module.exports = server;