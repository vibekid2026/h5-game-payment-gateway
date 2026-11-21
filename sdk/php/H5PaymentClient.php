<?php
/**
 * H5 Payment Gateway SDK for PHP Game Backends
 * Tương thích PHP 5.6 - PHP 8.x
 * Độc lập, không phụ thuộc thư viện ngoài (zero external dependency).
 */

class H5PaymentClient {
    private $gatewayUrl;
    private $secretKey;
    private $timeout;

    /**
     * Khởi tạo Payment Client
     * @param string $gatewayUrl Địa chỉ máy chủ Gateway (vd: http://localhost:3001)
     * @param string $secretKey Khóa bí mật chung (GATEWAY_SECRET_KEY)
     * @param int $timeout Timeout kết nối (giây)
     */
    public function __construct($gatewayUrl, $secretKey, $timeout = 10) {
        $this->gatewayUrl = rtrim($gatewayUrl, '/');
        $this->secretKey = $secretKey;
        $this->timeout = $timeout;
    }

    /**
     * Tạo đơn nạp tiền mới
     * @param array $params [
     *   'amount' => 50000,
     *   'userId' => 'player_123',
     *   'serverId' => 'S1',
     *   'gameCode' => 'MY_GAME',
     *   'itemPackage' => 'PKG_DIAMOND_50K',
     *   'notifyUrl' => 'http://my-game.com/api/callback.php',
     *   'customExtra' => ['roleName' => 'HeroXYZ']
     * ]
     * @return array Kết quả trả về chứa qrCodeUrl, paymentCode, orderCode...
     */
    public function createOrder(array $params) {
        $endpoint = $this->gatewayUrl . '/api/v1/orders/create';
        $response = $this->postJson($endpoint, $params);
        return $response;
    }

    /**
     * Tra cứu thông tin đơn hàng theo orderCode
     */
    public function getOrder($orderCode) {
        $endpoint = $this->gatewayUrl . '/api/v1/orders/' . urlencode($orderCode);
        return $this->getJson($endpoint);
    }

    /**
     * Xác thực chữ ký Callback gửi từ Gateway sang Game Server
     * @param array $payload Dữ liệu body JSON nhận từ Gateway
     * @param string $signatureHeader Giá trị header X-Gateway-Signature hoặc trường signature trong body
     * @return bool
     */
    public function verifyCallback(array $payload, $signatureHeader = null) {
        $receivedSig = $signatureHeader;
        if (empty($receivedSig) && isset($payload['signature'])) {
            $receivedSig = $payload['signature'];
        }

        if (empty($receivedSig)) {
            return false;
        }

        // Bỏ trường signature trước khi tính hash nếu nó nằm trong payload
        $dataToSign = $payload;
        unset($dataToSign['signature']);

        // Sắp xếp key để bảo đảm tính nhất quán
        ksort($dataToSign);
        $jsonString = json_encode($dataToSign, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $expectedSig = hash_hmac('sha256', $jsonString, $this->secretKey);

        return hash_equals($expectedSig, $receivedSig);
    }

    /**
     * Thực hiện POST JSON qua cURL
     */
    private function postJson($url, $data) {
        $payload = json_encode($data);
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Content-Length: ' . strlen($payload)
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            return ['success' => false, 'error' => 'cURL Error: ' . $err];
        }

        $decoded = json_decode($response, true);
        return $decoded ? $decoded : ['success' => false, 'error' => 'Invalid JSON response', 'raw' => $response];
    }

    /**
     * Thực hiện GET JSON qua cURL
     */
    private function getJson($url) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        $response = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            return ['success' => false, 'error' => 'cURL Error: ' . $err];
        }

        $decoded = json_decode($response, true);
        return $decoded ? $decoded : ['success' => false, 'error' => 'Invalid JSON response', 'raw' => $response];
    }
}
