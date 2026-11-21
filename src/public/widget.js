/**
 * H5Payment Widget SDK (Client Drop-in)
 * Cho phép bất kỳ Game H5 nào nhúng giao diện thanh toán tự động chỉ bằng 1 dòng script!
 * 
 * Usage in HTML:
 *   <script src="http://your-gateway-url/widget.js"></script>
 *   <script>
 *     H5Payment.open({
 *       gatewayUrl: 'http://localhost:3001',
 *       orderCode: 'ORD_123',
 *       paymentCode: 'PAY884123',
 *       qrCodeUrl: 'https://qr.sepay.vn/...',
 *       amount: 50000,
 *       onSuccess: function(data) {
 *         console.log('Thanh toán thành công:', data);
 *         alert('Nạp thành công! Đã nhận kim cương.');
 *       }
 *     });
 *   </script>
 */

(function (window) {
  'use strict';

  var H5Payment = {
    modalEl: null,
    sseSource: null,

    open: function (options) {
      options = options || {};
      var gatewayUrl = options.gatewayUrl || window.location.origin;
      var orderCode = options.orderCode;
      var paymentCode = options.paymentCode || orderCode;
      var qrCodeUrl = options.qrCodeUrl;
      var amount = options.amount || 0;
      var bankName = options.bankName || 'MBBank';
      var accountNumber = options.accountNumber || '';
      var accountName = options.accountName || '';
      var onSuccess = options.onSuccess || function () {};
      var onClose = options.onClose || function () {};

      this.close();

      var overlay = document.createElement('div');
      overlay.id = 'h5-payment-modal-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '999999';
      overlay.style.backdropFilter = 'blur(6px)';
      overlay.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

      var modal = document.createElement('div');
      modal.style.backgroundColor = '#181e2e';
      modal.style.color = '#ffffff';
      modal.style.borderRadius = '16px';
      modal.style.padding = '24px';
      modal.style.width = '90%';
      modal.style.maxWidth = '360px';
      modal.style.textAlign = 'center';
      modal.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
      modal.style.border = '1px solid rgba(255, 255, 255, 0.1)';
      modal.style.position = 'relative';

      var closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '12px';
      closeBtn.style.right = '14px';
      closeBtn.style.background = 'none';
      closeBtn.style.border = 'none';
      closeBtn.style.color = '#9ca3af';
      closeBtn.style.fontSize = '24px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.onclick = function () {
        H5Payment.close();
        onClose();
      };

      var title = document.createElement('div');
      title.innerText = 'Thanh Toán Nạp Game';
      title.style.fontSize = '18px';
      title.style.fontWeight = '700';
      title.style.marginBottom = '12px';

      var qrImg = document.createElement('img');
      qrImg.src = qrCodeUrl;
      qrImg.alt = 'QR Code';
      qrImg.style.width = '200px';
      qrImg.style.height = '200px';
      qrImg.style.borderRadius = '10px';
      qrImg.style.backgroundColor = '#ffffff';
      qrImg.style.padding = '6px';
      qrImg.style.margin = '0 auto 12px';
      qrImg.style.display = 'block';

      var infoBox = document.createElement('div');
      infoBox.style.backgroundColor = 'rgba(0,0,0,0.25)';
      infoBox.style.borderRadius = '8px';
      infoBox.style.padding = '10px';
      infoBox.style.fontSize = '13px';
      infoBox.style.textAlign = 'left';
      infoBox.style.marginBottom = '12px';
      infoBox.innerHTML = 
        '<div style="margin-bottom: 4px;"><strong>Số tiền:</strong> <span style="color:#10b981; font-weight:700;">' + Number(amount).toLocaleString() + ' đ</span></div>' +
        '<div style="margin-bottom: 4px;"><strong>Mã CK:</strong> <span style="color:#60a5fa; font-weight:700;">' + paymentCode + '</span></div>' +
        '<div style="color: #9ca3af; font-size: 11px;">Hệ thống tự động cộng sau 2-5 giây khi hoàn tất.</div>';

      var statusMsg = document.createElement('div');
      statusMsg.id = 'h5-payment-status';
      statusMsg.innerText = '⏳ Đang chờ chuyển khoản...';
      statusMsg.style.fontSize = '12px';
      statusMsg.style.color = '#fbbf24';

      modal.appendChild(closeBtn);
      modal.appendChild(title);
      modal.appendChild(qrImg);
      modal.appendChild(infoBox);
      modal.appendChild(statusMsg);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      this.modalEl = overlay;

      // Kết nối Realtime SSE
      if (orderCode && window.EventSource) {
        var streamUrl = gatewayUrl + '/api/v1/orders/' + encodeURIComponent(orderCode) + '/stream';
        this.sseSource = new EventSource(streamUrl);

        this.sseSource.onmessage = function (event) {
          try {
            var data = JSON.parse(event.data);
            if (data.status === 'PAID') {
              statusMsg.innerText = '✅ Đã nạp thành công!';
              statusMsg.style.color = '#10b981';
              statusMsg.style.fontWeight = '700';

              setTimeout(function () {
                H5Payment.close();
                onSuccess(data);
              }, 1200);
            }
          } catch (e) {}
        };
      }
    },

    close: function () {
      if (this.sseSource) {
        this.sseSource.close();
        this.sseSource = null;
      }
      if (this.modalEl && this.modalEl.parentNode) {
        this.modalEl.parentNode.removeChild(this.modalEl);
        this.modalEl = null;
      }
    }
  };

  window.H5Payment = H5Payment;
})(window);
