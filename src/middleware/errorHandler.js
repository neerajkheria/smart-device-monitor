const logger = require('../common/logger');

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  logger.error(err.message, {
    statusCode,
    path: req.originalUrl,
    method: req.method,
    stack: err.stack
  });

  res.status(statusCode).json({
    status,
    message: err.message || 'Internal Server Error'
  });
}

module.exports = errorHandler;