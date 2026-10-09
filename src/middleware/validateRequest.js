const { ValidationError } = require('../common/errors');

function validateDevicePayload(req, res, next) {
  const { name, type } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return next(new ValidationError('Device "name" is required and must be a non-empty string.'));
  }
  const validTypes = ['THERMAL_SENSOR', 'PRESSURE_VALVE', 'GATEWAY'];
  if (!type || !validTypes.includes(type)) {
    return next(new ValidationError(`Device "type" must be one of: ${validTypes.join(', ')}.`));
  }
  next();
}

function validateDeviceStatus(req, res, next) {
  const { status } = req.body;
  const allowed = ['ACTIVE', 'STANDBY', 'ERROR', 'MAINTENANCE'];
  if (!status || !allowed.includes(status)) {
    return next(new ValidationError(`Device status must be one of: ${allowed.join(', ')}.`));
  }
  next();
}

function validateIncidentStatus(req, res, next) {
  const { status } = req.body;
  const allowed = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];
  if (!status || !allowed.includes(status)) {
    return next(new ValidationError(`Incident status must be one of: ${allowed.join(', ')}.`));
  }
  next();
}

module.exports = {
  validateDevicePayload,
  validateDeviceStatus,
  validateIncidentStatus
};