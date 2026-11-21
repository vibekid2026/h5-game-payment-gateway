const { getStore } = require('../database/store');
const SePayAdapter = require('../adapters/sepay.adapter');
const orderService = require('./order.service');
const dispatcherService = require('./dispatcher.service');

class WebhookService {
  constructor() {
    this.store = getStore();
    this.sepayAdapter = new SePayAdapter();
  }

  /**
   * Xử lý webhook tự động từ SePay khi có biến động số dư ngân hàng
   */
  async processSePayWebhook(req) {
    const rawBody = req.body;

    // 1. Lưu log nhận webhook để tra soát
    await this.store.logWebhook({
      headers: req.headers,
      body: rawBody,
      ip: req.ip || req.connection.remoteAddress
    });

    // 2. Kiểm tra tính xác thực của request (API Key)
    const authCheck = this.sepayAdapter.validateWebhookAuth(req);
    if (!authCheck.valid) {
      console.warn('[WebhookService] Webhook rejected:', authCheck.error);
      return { success: false, code: 401, error: authCheck.error };
    }

    // 3. Chuẩn hóa payload
    const parsed = this.sepayAdapter.parseWebhookPayload(rawBody);
    console.log(`[WebhookService] Received SePay txn: ${parsed.referenceCode}, amount: ${parsed.transferAmount}, content: "${parsed.content}"`);

    // Chỉ xử lý giao dịch tiền vào (transferType = 'in')
    if (parsed.transferType !== 'in') {
      return { success: true, message: 'Skipped non-inward transfer' };
    }

    // 4. Tìm mã thanh toán trong nội dung chuyển khoản
    const paymentCode = parsed.extractedPaymentCode;
    if (!paymentCode) {
      console.log(`[WebhookService] No matching payment code found in content: "${parsed.content}"`);
      return { success: true, message: 'No payment code matched in transfer content' };
    }

    // 5. Tìm đơn hàng tương ứng trong cơ sở dữ liệu
    const order = await this.store.findOrderByPaymentCode(paymentCode);
    if (!order) {
      console.warn(`[WebhookService] Order not found for payment code: ${paymentCode}`);
      return { success: true, message: `No pending order found for code ${paymentCode}` };
    }

    // 6. Kiểm tra Idempotency (Tránh nạp 2 lần cho cùng 1 đơn)
    if (order.status === 'PAID') {
      console.log(`[WebhookService] Order ${order.orderCode} already marked as PAID. Skipping duplicate processing.`);
      return { 
        success: true, 
        message: 'Order already completed', 
        orderCode: order.orderCode,
        isDuplicate: true 
      };
    }

    // 7. Kiểm tra số tiền chuyển có đủ không
    if (parsed.transferAmount < order.amount) {
      console.warn(`[WebhookService] Underpaid order ${order.orderCode}: Expected ${order.amount}, received ${parsed.transferAmount}`);
      // Có thể ghi log hoặc cập nhật trạng thái PARTIAL_PAID
      order.status = 'UNDERPAID';
      order.paidAmount = parsed.transferAmount;
      await this.store.saveOrder(order);
      orderService.notifyOrderUpdate(order.orderCode, { 
        status: 'UNDERPAID',
        receivedAmount: parsed.transferAmount,
        expectedAmount: order.amount
      });
      return { success: false, code: 400, error: 'Insufficient transfer amount' };
    }

    // 8. Cập nhật trạng thái đơn hàng thành PAID
    order.status = 'PAID';
    order.paidAt = new Date().toISOString();
    order.transactionRef = parsed.referenceCode;
    await this.store.saveOrder(order);

    // 9. Lưu chi tiết giao dịch
    const transaction = await this.store.saveTransaction({
      orderCode: order.orderCode,
      gateway: 'sepay',
      referenceCode: parsed.referenceCode,
      accountNumber: parsed.accountNumber,
      transferAmount: parsed.transferAmount,
      transferContent: parsed.content,
      rawPayload: rawBody
    });

    // 10. Đẩy sự kiện realtime SSE tới Client UI để tự động đóng QR và báo thành công
    orderService.notifyOrderUpdate(order.orderCode, {
      status: 'PAID',
      paidAt: order.paidAt,
      amount: order.amount,
      itemPackage: order.itemPackage,
      transactionRef: parsed.referenceCode
    });

    // 11. Bắn callback sang Game Server (với chữ ký HMAC-SHA256)
    const dispatchResult = await dispatcherService.dispatchToGame(order, transaction);

    return {
      success: true,
      message: 'Payment processed successfully',
      orderCode: order.orderCode,
      gameDispatched: dispatchResult.success,
      dispatchResult
    };
  }
}

module.exports = new WebhookService();
