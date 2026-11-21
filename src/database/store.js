const fs = require('fs');
const path = require('path');
const config = require('../config');

// In-Memory & File-based storage for zero-dependency local testing
class FileStore {
  constructor() {
    this.dataDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.ordersFile = path.join(this.dataDir, 'orders.json');
    this.transactionsFile = path.join(this.dataDir, 'transactions.json');
    this.webhooksFile = path.join(this.dataDir, 'webhook_logs.json');

    this.orders = this._loadFile(this.ordersFile);
    this.transactions = this._loadFile(this.transactionsFile);
    this.webhooks = this._loadFile(this.webhooksFile);
  }

  _loadFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) {
      console.error(`[FileStore] Error reading ${filePath}:`, e.message);
    }
    return {};
  }

  _saveFile(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`[FileStore] Error saving ${filePath}:`, e.message);
    }
  }

  async saveOrder(order) {
    this.orders[order.orderCode] = { ...order, updatedAt: new Date().toISOString() };
    this._saveFile(this.ordersFile, this.orders);
    return this.orders[order.orderCode];
  }

  async getOrder(orderCode) {
    return this.orders[orderCode] || null;
  }

  async findOrderByPaymentCode(paymentCode) {
    const list = Object.values(this.orders);
    return list.find(o => o.paymentCode === paymentCode || o.orderCode === paymentCode) || null;
  }

  async listOrders(filters = {}) {
    let list = Object.values(this.orders);
    if (filters.status) list = list.filter(o => o.status === filters.status);
    if (filters.gameCode) list = list.filter(o => o.gameCode === filters.gameCode);
    if (filters.userId) list = list.filter(o => o.userId === filters.userId);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async saveTransaction(transaction) {
    const id = transaction.id || `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.transactions[id] = { ...transaction, id, createdAt: new Date().toISOString() };
    this._saveFile(this.transactionsFile, this.transactions);
    return this.transactions[id];
  }

  async getTransactionByRef(refCode) {
    return Object.values(this.transactions).find(t => t.referenceCode === refCode) || null;
  }

  async logWebhook(logData) {
    const id = `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.webhooks[id] = { ...logData, id, loggedAt: new Date().toISOString() };
    this._saveFile(this.webhooksFile, this.webhooks);
    return this.webhooks[id];
  }
}

// MySQL Storage Driver (Production ready)
class MySQLStore {
  constructor(pool) {
    this.pool = pool;
    this._initTables();
  }

  async _initTables() {
    try {
      const conn = await this.pool.getConnection();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_code VARCHAR(64) UNIQUE NOT NULL,
          payment_code VARCHAR(64) UNIQUE NOT NULL,
          game_code VARCHAR(32) NOT NULL,
          user_id VARCHAR(64) NOT NULL,
          server_id VARCHAR(32) NOT NULL,
          amount INT NOT NULL,
          currency VARCHAR(10) DEFAULT 'VND',
          item_package VARCHAR(64),
          status VARCHAR(20) DEFAULT 'PENDING',
          notify_url TEXT,
          custom_extra TEXT,
          paid_at DATETIME NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_order_code (order_code),
          INDEX idx_payment_code (payment_code),
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS payment_transactions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_code VARCHAR(64) NOT NULL,
          gateway VARCHAR(32) DEFAULT 'sepay',
          reference_code VARCHAR(64),
          account_number VARCHAR(32),
          transfer_amount INT NOT NULL,
          transfer_content TEXT,
          raw_payload JSON,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_order_code (order_code),
          INDEX idx_ref (reference_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      conn.release();
    } catch (e) {
      console.warn('[MySQLStore] Failed to initialize tables:', e.message);
    }
  }

  async saveOrder(order) {
    const sql = `
      INSERT INTO payment_orders 
      (order_code, payment_code, game_code, user_id, server_id, amount, currency, item_package, status, notify_url, custom_extra, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      status = VALUES(status), paid_at = VALUES(paid_at), updated_at = NOW();
    `;
    await this.pool.execute(sql, [
      order.orderCode,
      order.paymentCode,
      order.gameCode || 'DEFAULT',
      order.userId,
      order.serverId || '1',
      order.amount,
      order.currency || 'VND',
      order.itemPackage || '',
      order.status || 'PENDING',
      order.notifyUrl || '',
      JSON.stringify(order.customExtra || {}),
      new Date(order.expiresAt)
    ]);
    return order;
  }

  async getOrder(orderCode) {
    const [rows] = await this.pool.execute('SELECT * FROM payment_orders WHERE order_code = ? LIMIT 1', [orderCode]);
    return rows[0] || null;
  }

  async findOrderByPaymentCode(paymentCode) {
    const [rows] = await this.pool.execute(
      'SELECT * FROM payment_orders WHERE payment_code = ? OR order_code = ? LIMIT 1', 
      [paymentCode, paymentCode]
    );
    return rows[0] || null;
  }

  async listOrders() {
    const [rows] = await this.pool.execute('SELECT * FROM payment_orders ORDER BY id DESC LIMIT 100');
    return rows;
  }

  async saveTransaction(txn) {
    const sql = `
      INSERT INTO payment_transactions (order_code, gateway, reference_code, account_number, transfer_amount, transfer_content, raw_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    await this.pool.execute(sql, [
      txn.orderCode,
      txn.gateway || 'sepay',
      txn.referenceCode || '',
      txn.accountNumber || '',
      txn.transferAmount,
      txn.transferContent || '',
      JSON.stringify(txn.rawPayload || {})
    ]);
    return txn;
  }

  async getTransactionByRef(refCode) {
    const [rows] = await this.pool.execute('SELECT * FROM payment_transactions WHERE reference_code = ? LIMIT 1', [refCode]);
    return rows[0] || null;
  }

  async logWebhook(log) {
    return { ...log, loggedAt: new Date().toISOString() };
  }
}

// Factory instantiation
let storeInstance = null;
function getStore() {
  if (storeInstance) return storeInstance;

  if (config.db.driver === 'mysql') {
    try {
      const mysql = require('mysql2/promise');
      const pool = mysql.createPool({
        host: config.db.mysql.host,
        port: config.db.mysql.port,
        user: config.db.mysql.user,
        password: config.db.mysql.password,
        database: config.db.mysql.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
      console.log('[Store] Initialized MySQL Store Driver');
      storeInstance = new MySQLStore(pool);
      return storeInstance;
    } catch (err) {
      console.warn('[Store] MySQL connection failed, falling back to FileStore:', err.message);
    }
  }

  storeInstance = new FileStore();
  console.log('[Store] Initialized FileStore (zero-dependency)');
  return storeInstance;
}

module.exports = {
  getStore,
  FileStore,
  MySQLStore
};
