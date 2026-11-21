const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  gatewaySecretKey: process.env.GATEWAY_SECRET_KEY || 'gateway_default_secret_key_change_me',
  
  // Ngân hàng & SePay
  sepay: {
    apiKey: process.env.SEPAY_API_KEY || 'test_sepay_api_key_sandbox',
    bankCode: process.env.BANK_CODE || 'MBBank',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '0987654321',
    accountName: process.env.BANK_ACCOUNT_NAME || 'NGUYEN VAN A',
    paymentCodePrefix: process.env.PAYMENT_CODE_PREFIX || 'PAY',
  },

  // Đơn hàng
  orderExpireMinutes: parseInt(process.env.ORDER_EXPIRE_MINUTES, 10) || 15,

  // Database
  db: {
    driver: process.env.DB_DRIVER || 'file',
    mysql: {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'game_payment_gateway',
    }
  },

  // Game Callback
  defaultGameCallbackUrl: process.env.DEFAULT_GAME_CALLBACK_URL || '',
};

module.exports = config;
