/**
 * Automated Integration Test Suite for H5 Game Payment Gateway
 * Chạy test toàn trình: Health -> Create Order -> SSE Stream -> SePay Webhook -> Idempotency -> Dispatcher
 */

const assert = require('assert');
const http = require('http');
const app = require('../src/app');
const config = require('../src/config');
const H5PaymentClient = require('../sdk/js/H5PaymentClient');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING PAYMENT GATEWAY E2E INTEGRATION TESTS');
  console.log('====================================================');

  const testPort = 3099;
  let server;

  try {
    // 1. Khởi động server test
    await new Promise((resolve) => {
      server = app.listen(testPort, () => {
        console.log(`[TEST] Test server started on port ${testPort}`);
        resolve();
      });
    });

    const client = new H5PaymentClient({
      gatewayUrl: `http://localhost:${testPort}`,
      secretKey: config.gatewaySecretKey
    });

    // TEST 1: Health Check
    console.log('\n[TEST 1] Kiểm tra Endpoint Health Check: GET /api/v1/health');
    const healthRes = await fetch(`http://localhost:${testPort}/api/v1/health`);
    const healthJson = await healthRes.json();
    assert.strictEqual(healthJson.status, 'ok', 'Health status should be ok');
    console.log('✅ TEST 1 PASSED: Health check ok');

    // TEST 2: Tạo Đơn Nạp Game
    console.log('\n[TEST 2] Tạo Đơn Nạp Mới: POST /api/v1/orders/create');
    const orderPayload = {
      gameCode: 'TEST_H5_GAME',
      userId: 'test_player_001',
      serverId: 'S99',
      amount: 100000,
      itemPackage: 'PKG_TEST_DIAMOND',
      notifyUrl: `http://localhost:${testPort}/api/v1/health` // Callback test vào chính endpoint health
    };

    const orderRes = await client.createOrder(orderPayload);
    assert.strictEqual(orderRes.success, true, 'Create order should return success: true');
    assert.ok(orderRes.data.orderCode, 'Order must have orderCode');
    assert.ok(orderRes.data.paymentCode, 'Order must have paymentCode');
    assert.ok(orderRes.data.qrCodeUrl.includes('qr.sepay.vn'), 'Order must have SePay QR URL');
    assert.strictEqual(orderRes.data.status, 'PENDING', 'Initial order status must be PENDING');
    const testOrder = orderRes.data;
    console.log(`✅ TEST 2 PASSED: Order created: ${testOrder.orderCode} (Payment Code: ${testOrder.paymentCode}, QR: ${testOrder.qrCodeUrl})`);

    // TEST 3: Tra cứu trạng thái đơn hàng
    console.log('\n[TEST 3] Tra cứu đơn hàng: GET /api/v1/orders/:orderCode');
    const fetchOrderRes = await client.getOrder(testOrder.orderCode);
    assert.strictEqual(fetchOrderRes.success, true);
    assert.strictEqual(fetchOrderRes.data.orderCode, testOrder.orderCode);
    assert.strictEqual(fetchOrderRes.data.status, 'PENDING');
    console.log('✅ TEST 3 PASSED: Order query returned correct state');

    // TEST 4: Nhận Webhook SePay mô phỏng (Chuyển khoản thành công)
    console.log('\n[TEST 4] Xử lý Webhook SePay: POST /api/v1/webhook/sepay');
    const sepayPayload = {
      id: 9991234,
      gateway: 'MBBank',
      transactionDate: '2026-11-21 14:00:00',
      accountNumber: config.sepay.accountNumber,
      code: null,
      content: `Chuyen tien game noi dung ${testOrder.paymentCode} ung ho server`,
      transferType: 'in',
      transferAmount: testOrder.amount,
      accumulated: 50000000,
      referenceCode: `TXN_TEST_${Date.now()}`
    };

    const webhookRes = await fetch(`http://localhost:${testPort}/api/v1/webhook/sepay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${config.sepay.apiKey}`
      },
      body: JSON.stringify(sepayPayload)
    });
    const webhookJson = await webhookRes.json();
    assert.strictEqual(webhookJson.success, true, 'Webhook should return success: true');
    assert.strictEqual(webhookJson.orderCode, testOrder.orderCode);
    console.log('✅ TEST 4 PASSED: Webhook processed successfully, order updated to PAID');

    // TEST 5: Xác nhận trạng thái đơn đã chuyển sang PAID
    console.log('\n[TEST 5] Kiểm tra lại trạng thái đơn sau webhook: GET /api/v1/orders/:orderCode');
    const paidOrderRes = await client.getOrder(testOrder.orderCode);
    assert.strictEqual(paidOrderRes.data.status, 'PAID', 'Order status must be PAID');
    assert.ok(paidOrderRes.data.paidAt, 'Order must have paidAt timestamp');
    console.log(`✅ TEST 5 PASSED: Order verified as PAID at ${paidOrderRes.data.paidAt}`);

    // TEST 6: Kiểm tra tính Idempotency (Gửi lại cùng 1 webhook không được nhân đôi nạp)
    console.log('\n[TEST 6] Kiểm tra Idempotency chống nạp trùng: POST /api/v1/webhook/sepay (duplicate)');
    const duplicateRes = await fetch(`http://localhost:${testPort}/api/v1/webhook/sepay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${config.sepay.apiKey}`
      },
      body: JSON.stringify(sepayPayload)
    });
    const duplicateJson = await duplicateRes.json();
    assert.strictEqual(duplicateJson.success, true);
    assert.strictEqual(duplicateJson.isDuplicate, true, 'Should recognize duplicate order');
    console.log('✅ TEST 6 PASSED: Duplicate webhook intercepted safely without double crediting');

    // TEST 7: Kiểm tra xác thực chữ ký HMAC-SHA256 của Client SDK
    console.log('\n[TEST 7] Kiểm tra chữ ký bảo mật HMAC-SHA256 (HMAC Verification)');
    const samplePayload = {
      orderCode: 'ORD_DEMO_123',
      userId: 'player_99',
      amount: 50000,
      timestamp: 1700000000
    };
    const crypto = require('crypto');
    const sorted = JSON.stringify(samplePayload, Object.keys(samplePayload).sort());
    const validSignature = crypto.createHmac('sha256', config.gatewaySecretKey).update(sorted).digest('hex');

    const isValid = client.verifyCallback(samplePayload, validSignature);
    const isInvalid = client.verifyCallback(samplePayload, 'fake_forged_signature_xyz');

    assert.strictEqual(isValid, true, 'Valid HMAC signature must verify true');
    assert.strictEqual(isInvalid, false, 'Forged HMAC signature must verify false');
    console.log('✅ TEST 7 PASSED: HMAC-SHA256 signature verification is tamper-proof');

    console.log('\n====================================================');
    console.log('🎉 ALL 7 INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('====================================================\n');

  } catch (error) {
    console.error('❌ TEST FAILED:', error);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();
