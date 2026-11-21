const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log('================================================================');
  console.log(`🚀 H5 Game Payment Gateway is running on port ${config.port}`);
  console.log(`📡 Test Playground & Sandbox UI: http://localhost:${config.port}`);
  console.log(`⚡ API Endpoint: http://localhost:${config.port}/api/v1`);
  console.log(`💳 SePay Webhook Endpoint: http://localhost:${config.port}/api/v1/webhook/sepay`);
  console.log(`📦 Storage Driver: ${config.db.driver.toUpperCase()}`);
  console.log('================================================================');
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('[Gateway] Server shut down gracefully.');
    process.exit(0);
  });
});
