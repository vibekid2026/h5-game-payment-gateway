const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api.routes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets for Test Playground & Embed Widget
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/v1', apiRoutes);

// Root redirects or renders the Test Playground
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ success: false, error: 'Internal Server Error', message: err.message });
});

module.exports = app;
