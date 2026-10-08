const express = require('express');
const deviceRoutes = require('./routes/deviceRoutes');
const alertRoutes = require('./routes/alertRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const errorHandler = require('./middleware/errorHandler');
const { NotFoundError } = require('./common/errors');

const app = express();

// Body Parser Middleware
app.use(express.json());

// Base Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Resource Routing
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/incidents', incidentRoutes);

// Catch-all for unhandled routes
app.all('*', (req, res, next) => {
  next(new NotFoundError(`Cannot find ${req.method} ${req.originalUrl} on this server`));
});

// Central Error Handling Middleware
app.use(errorHandler);

module.exports = app;