class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid request payload') {
    super(message, 400);
  }
}

class HardwareCommError extends AppError {
  constructor(message = 'Hardware Interface Communication Failure') {
    super(message, 502);
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  HardwareCommError
};