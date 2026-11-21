const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');

/**
 * DispatcherService: Gửi thông báo nạp thành công (Callback) sang Game Server
 * Kèm chữ ký bảo mật HMAC-SHA256 để chống giả mạo thông tin.
 */
class DispatcherService {
  constructor(secretKey = config.gatewaySecretKey) {
    this.secretKey = secretKey;
  }

  /**
   * Tạo chữ ký HMAC-SHA256 từ payload
   */
  generateSignature(payload) {
    const sortedString = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload, Object.keys(payload).sort());
    
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(sortedString)
      .digest('hex');
  }

  /**
   * Xác thực chữ ký nhận từ Game Server hoặc Gateway
   */
  verifySignature(payload, signature) {
    if (!signature) return false;
    const expected = this.generateSignature(payload);
    const bufExpected = Buffer.from(expected);
    const bufReceived = Buffer.from(signature);
    if (bufExpected.length !== bufReceived.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufExpected, bufReceived);
  }

  /**
   * Gửi callback đến Game Server với cơ chế thử lại (Retry Backoff)
   * @param {Object} order - Thông tin đơn hàng đã thanh toán
   * @param {Object} transaction - Thông tin giao dịch ngân hàng
   * @param {string} customNotifyUrl - URL nhận thông báo nạp của game
   */
  async dispatchToGame(order, transaction, customNotifyUrl = null) {
    const targetUrl = customNotifyUrl || order.notifyUrl || config.defaultGameCallbackUrl;

    if (!targetUrl) {
      console.warn(`[Dispatcher] No notifyUrl specified for order ${order.orderCode}. Skipping callback.`);
      return { success: false, reason: 'NO_NOTIFY_URL' };
    }

    const callbackPayload = {
      orderCode: order.orderCode,
      paymentCode: order.paymentCode,
      gameCode: order.gameCode || 'DEFAULT',
      userId: order.userId,
      serverId: order.serverId,
      amount: order.amount,
      itemPackage: order.itemPackage,
      customExtra: order.customExtra || {},
      paidAt: order.paidAt || new Date().toISOString(),
      transaction: {
        gateway: transaction.gateway || 'sepay',
        referenceCode: transaction.referenceCode,
        accountNumber: transaction.accountNumber,
        transferAmount: transaction.transferAmount,
      },
      timestamp: Date.now()
    };

    const signature = this.generateSignature(callbackPayload);
    callbackPayload.signature = signature;

    const maxRetries = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
      attempt++;
      try {
        console.log(`[Dispatcher] Sending callback to Game Server (Attempt ${attempt}/${maxRetries}): ${targetUrl}`);
        const response = await axios.post(targetUrl, callbackPayload, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
            'X-Gateway-Signature': signature,
            'User-Agent': 'H5GamePaymentGateway/1.0.0'
          }
        });

        // Game server trả về status 200 hoặc response.data.success = true
        if (response.status >= 200 && response.status < 300) {
          console.log(`[Dispatcher] Game Server acknowledged callback successfully for order ${order.orderCode}`);
          return {
            success: true,
            attempts: attempt,
            statusCode: response.status,
            responseData: response.data
          };
        }
      } catch (err) {
        lastError = err.message;
        console.warn(`[Dispatcher] Attempt ${attempt} failed for order ${order.orderCode}: ${err.message}`);
        // Chờ ngắn trước khi retry (500ms, 1500ms...)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }

    return {
      success: false,
      attempts: attempt,
      error: lastError
    };
  }
}

module.exports = new DispatcherService();
