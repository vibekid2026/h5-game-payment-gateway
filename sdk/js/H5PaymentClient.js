const crypto = require('crypto');
const axios = require('axios');

class H5PaymentClient {
  constructor(options = {}) {
    this.gatewayUrl = (options.gatewayUrl || 'http://localhost:3001').replace(/\/+$/, '');
    this.secretKey = options.secretKey || '';
    this.timeout = options.timeout || 10000;
  }

  async createOrder(params) {
    const res = await axios.post(`${this.gatewayUrl}/api/v1/orders/create`, params, {
      timeout: this.timeout
    });
    return res.data;
  }

  async getOrder(orderCode) {
    const res = await axios.get(`${this.gatewayUrl}/api/v1/orders/${encodeURIComponent(orderCode)}`, {
      timeout: this.timeout
    });
    return res.data;
  }

  verifyCallback(payload, signatureHeader) {
    const receivedSig = signatureHeader || (payload && payload.signature);
    if (!receivedSig || !this.secretKey) return false;

    const dataToSign = { ...payload };
    delete dataToSign.signature;

    const sortedString = JSON.stringify(dataToSign, Object.keys(dataToSign).sort());
    const expectedSig = crypto
      .createHmac('sha256', this.secretKey)
      .update(sortedString)
      .digest('hex');

    const bufExpected = Buffer.from(expectedSig);
    const bufReceived = Buffer.from(receivedSig);
    if (bufExpected.length !== bufReceived.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufExpected, bufReceived);
  }
}

module.exports = H5PaymentClient;
