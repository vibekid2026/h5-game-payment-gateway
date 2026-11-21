const express = require('express');
const router = express.Router();
const orderService = require('../services/order.service');
const webhookService = require('../services/webhook.service');
const { getStore } = require('../database/store');
const config = require('../config');

// Health Check (Supports both GET and POST for mock callback testing)
router.all('/health', (req, res) => {
  res.json({
    status: 'ok',
    success: true,
    service: 'H5 Game Payment Gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * 1. API Tạo Đơn Nạp Game
 * POST /api/v1/orders/create
 * Body: { amount, userId, serverId, gameCode, itemPackage, notifyUrl, customExtra }
 */
router.post('/orders/create', async (req, res) => {
  try {
    const order = await orderService.createOrder(req.body);
    res.json({
      success: true,
      message: 'Order created successfully',
      data: order
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 2. API Tra cứu trạng thái đơn nạp
 * GET /api/v1/orders/:orderCode
 */
router.get('/orders/:orderCode', async (req, res) => {
  try {
    const order = await orderService.getOrder(req.params.orderCode);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 3. API Danh sách đơn nạp gần nhất
 * GET /api/v1/orders
 */
router.get('/orders', async (req, res) => {
  try {
    const store = getStore();
    const orders = await store.listOrders(req.query);
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 4. SSE (Server-Sent Events) Stream để Client lắng nghe trạng thái nạp Realtime
 * GET /api/v1/orders/:orderCode/stream
 */
router.get('/orders/:orderCode/stream', (req, res) => {
  const { orderCode } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  orderService.registerSseClient(orderCode, res);
});

/**
 * 5. Webhook nhận biến động số dư từ SePay
 * POST /api/v1/webhook/sepay
 */
router.post('/webhook/sepay', async (req, res) => {
  try {
    const result = await webhookService.processSePayWebhook(req);
    if (!result.success && result.code) {
      return res.status(result.code).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('[Route] Webhook processing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 6. Sandbox Simulator (Dùng để test local hoặc mô phỏng thanh toán thành công)
 * POST /api/v1/sandbox/simulate
 * Body: { paymentCode, amount, referenceCode }
 */
router.post('/sandbox/simulate', async (req, res) => {
  const { paymentCode, amount, referenceCode } = req.body;
  if (!paymentCode) {
    return res.status(400).json({ success: false, error: 'paymentCode is required' });
  }

  // Giả lập một request từ SePay
  const fakeSePayPayload = {
    id: Math.floor(100000 + Math.random() * 900000),
    gateway: 'SIMULATOR',
    transactionDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
    accountNumber: config.sepay.accountNumber,
    code: null,
    content: `${paymentCode} Chuyen khoan test sandbox`,
    transferType: 'in',
    transferAmount: amount ? Number(amount) : 50000,
    accumulated: 10000000,
    subAccount: null,
    referenceCode: referenceCode || `SIM_${Date.now()}`,
    description: 'Sandbox simulation test'
  };

  const fakeReq = {
    headers: {
      'authorization': `Apikey ${config.sepay.apiKey}`
    },
    body: fakeSePayPayload,
    ip: '127.0.0.1'
  };

  const result = await webhookService.processSePayWebhook(fakeReq);
  res.json({
    success: result.success,
    simulatedPayload: fakeSePayPayload,
    result
  });
});

module.exports = router;
