const crypto = require('crypto');
const config = require('../config');
const { getStore } = require('../database/store');
const SePayAdapter = require('../adapters/sepay.adapter');

class OrderService {
  constructor() {
    this.store = getStore();
    this.sepayAdapter = new SePayAdapter();
    // Quản lý các kết nối SSE (Server-Sent Events) theo orderCode
    // Key: orderCode, Value: Set of response objects
    this.sseClients = new Map();
  }

  /**
   * Sinh mã thanh toán ngẫu nhiên hoặc theo quy chuẩn (ví dụ: PAY874312)
   */
  generatePaymentCode() {
    const prefix = config.sepay.paymentCodePrefix;
    const randomSuffix = Math.floor(100000 + Math.random() * 900000); // 6 số ngẫu nhiên
    return `${prefix}${randomSuffix}`;
  }

  /**
   * Sinh mã đơn hàng duy nhất (Unique Order Code)
   */
  generateOrderCode() {
    const timestamp = Date.now().toString().slice(-8);
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD_${timestamp}_${rand}`;
  }

  /**
   * Tạo đơn hàng nạp game mới
   */
  async createOrder(data) {
    const {
      amount,
      gameCode = 'DEFAULT',
      userId,
      serverId = '1',
      itemPackage = '',
      notifyUrl = config.defaultGameCallbackUrl,
      customExtra = {},
      customOrderCode = null
    } = data;

    if (!amount || amount <= 0) {
      throw new Error('Số tiền nạp (amount) phải lớn hơn 0');
    }
    if (!userId) {
      throw new Error('Thiếu thông tin người chơi (userId)');
    }

    const orderCode = customOrderCode || this.generateOrderCode();
    const paymentCode = this.generatePaymentCode();
    
    // Tính thời gian hết hạn
    const expiresAt = new Date(Date.now() + config.orderExpireMinutes * 60 * 1000).toISOString();

    // Sinh QR Code Url
    const qrCodeUrl = this.sepayAdapter.generateQrUrl(amount, paymentCode);
    const fallbackQrUrl = this.sepayAdapter.generateVietQrFallbackUrl(amount, paymentCode);

    const order = {
      orderCode,
      paymentCode,
      gameCode,
      userId,
      serverId,
      amount: parseInt(amount, 10),
      currency: 'VND',
      itemPackage,
      status: 'PENDING', // PENDING, PAID, EXPIRED, CANCELLED
      notifyUrl,
      customExtra,
      qrCodeUrl,
      fallbackQrUrl,
      bankInfo: {
        bankCode: config.sepay.bankCode,
        accountNumber: config.sepay.accountNumber,
        accountName: config.sepay.accountName,
        paymentContent: paymentCode,
        amount: parseInt(amount, 10)
      },
      expiresAt,
      createdAt: new Date().toISOString()
    };

    await this.store.saveOrder(order);
    return order;
  }

  /**
   * Lấy thông tin đơn hàng theo orderCode
   */
  async getOrder(orderCode) {
    const order = await this.store.getOrder(orderCode);
    if (!order) return null;

    // Kiểm tra hết hạn nếu đang PENDING
    if (order.status === 'PENDING' && new Date(order.expiresAt) < new Date()) {
      order.status = 'EXPIRED';
      await this.store.saveOrder(order);
      this.notifyOrderUpdate(orderCode, { status: 'EXPIRED' });
    }

    return order;
  }

  /**
   * Đăng ký client nhận thông báo realtime qua Server-Sent Events (SSE)
   */
  registerSseClient(orderCode, res) {
    if (!this.sseClients.has(orderCode)) {
      this.sseClients.set(orderCode, new Set());
    }
    this.sseClients.get(orderCode).add(res);

    // Gửi ping chào mừng ban đầu
    res.write(`data: ${JSON.stringify({ event: 'connected', orderCode })}\n\n`);

    // Xử lý khi client ngắt kết nối
    res.on('close', () => {
      const clients = this.sseClients.get(orderCode);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          this.sseClients.delete(orderCode);
        }
      }
    });
  }

  /**
   * Đẩy thông báo tức thì (Push Notification) đến các client đang mở giao diện thanh toán
   */
  notifyOrderUpdate(orderCode, updateData) {
    const clients = this.sseClients.get(orderCode);
    if (clients && clients.size > 0) {
      const payload = JSON.stringify({
        orderCode,
        ...updateData,
        timestamp: Date.now()
      });

      for (const client of clients) {
        try {
          client.write(`data: ${payload}\n\n`);
        } catch (e) {
          // Client đã đóng
        }
      }
    }
  }
}

module.exports = new OrderService();
