const config = require('../config');

/**
 * SePay Adapter: Handles QR generation and SePay webhook validation
 */
class SePayAdapter {
  constructor(customConfig = {}) {
    this.bankCode = customConfig.bankCode || config.sepay.bankCode;
    this.accountNumber = customConfig.accountNumber || config.sepay.accountNumber;
    this.accountName = customConfig.accountName || config.sepay.accountName;
    this.apiKey = customConfig.apiKey || config.sepay.apiKey;
    this.prefix = customConfig.paymentCodePrefix || config.sepay.paymentCodePrefix;
  }

  /**
   * Sinh link ảnh SePay QR Code tự động
   * Format: https://qr.sepay.vn/img?bank={BANK}&acc={ACC}&template=compact&amount={AMOUNT}&des={CONTENT}
   */
  generateQrUrl(amount, paymentCode) {
    const bank = encodeURIComponent(this.bankCode);
    const acc = encodeURIComponent(this.accountNumber);
    const des = encodeURIComponent(paymentCode);
    const amt = encodeURIComponent(amount);
    return `https://qr.sepay.vn/img?bank=${bank}&acc=${acc}&template=compact&amount=${amt}&des=${des}`;
  }

  /**
   * Sinh link VietQR QuickLink (dự phòng độc lập không phụ thuộc SePay CDN)
   */
  generateVietQrFallbackUrl(amount, paymentCode) {
    const bank = encodeURIComponent(this.bankCode);
    const acc = encodeURIComponent(this.accountNumber);
    const des = encodeURIComponent(paymentCode);
    const name = encodeURIComponent(this.accountName);
    return `https://api.vietqr.io/image/${bank}-${acc}-compact2.jpg?amount=${amount}&addInfo=${des}&accountName=${name}`;
  }

  /**
   * Kiểm tra tính hợp lệ của Header Webhook từ SePay
   * SePay gửi header: `Authorization: Apikey <API_KEY>`
   */
  validateWebhookAuth(req) {
    // Nếu trong môi trường test/sandbox hoặc API key chưa đặt
    if (!this.apiKey || this.apiKey === 'test_sepay_api_key_sandbox') {
      return { valid: true, note: 'Sandbox / default API key mode' };
    }

    const authHeader = req.headers['authorization'] || req.headers['apikey'] || '';
    
    // Check "Apikey <KEY>"
    const match = authHeader.match(/^(?:Apikey|Bearer)\s+(.+)$/i);
    const token = match ? match[1].trim() : authHeader.trim();

    if (token === this.apiKey) {
      return { valid: true };
    }

    return { valid: false, error: 'Unauthorized webhook request (Invalid API Key)' };
  }

  /**
   * Bóc tách mã thanh toán (PAYxxxxx) từ nội dung chuyển khoản ngân hàng
   * Ví dụ: "MBVCB.123456.PAY982145.CT tu..." -> trích xuất "PAY982145"
   */
  extractPaymentCode(content) {
    if (!content || typeof content !== 'string') return null;
    
    const escapedPrefix = this.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedPrefix}[A-Z0-9_-]+)`, 'i');
    const match = content.match(regex);
    
    return match ? match[1].toUpperCase() : null;
  }

  /**
   * Chuẩn hóa payload nhận được từ SePay Webhook
   * Format SePay:
   * {
   *   "id": 92704,
   *   "gateway": "Vietcombank",
   *   "transactionDate": "2024-03-20 10:15:00",
   *   "accountNumber": "0987654321",
   *   "code": null,
   *   "content": "PAY100234 ung ho game",
   *   "transferType": "in",
   *   "transferAmount": 50000,
   *   "accumulated": 1902000,
   *   "subAccount": null,
   *   "referenceCode": "MBVCB.12345678",
   *   "description": "..."
   * }
   */
  parseWebhookPayload(body) {
    return {
      rawId: body.id,
      gateway: body.gateway || 'bank',
      transactionDate: body.transactionDate || new Date().toISOString(),
      accountNumber: body.accountNumber,
      transferType: body.transferType || 'in',
      transferAmount: Number(body.transferAmount || 0),
      content: body.content || '',
      referenceCode: body.referenceCode || (body.id ? `SEPAY_${body.id}` : `REF_${Date.now()}`),
      extractedPaymentCode: this.extractPaymentCode(body.content)
    };
  }
}

module.exports = SePayAdapter;
