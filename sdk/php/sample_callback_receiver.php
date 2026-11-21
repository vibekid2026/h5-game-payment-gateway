<?php
/**
 * Ví dụ Game Callback Handler Endpoint (cho Game Backend PHP)
 * Đặt file này tại: /api/payment_callback.php của game server
 */

require_once __DIR__ . '/H5PaymentClient.php';

header('Content-Type: application/json; charset=utf-8');

// 1. Cấu hình khóa bí mật (phải khớp với GATEWAY_SECRET_KEY trong .env của Gateway)
$secretKey = 'gateway_secret_super_key_2026_!@#';
$client = new H5PaymentClient('http://localhost:3001', $secretKey);

// 2. Nhận payload từ Gateway
$rawBody = file_get_contents('php://input');
$data = json_decode($rawBody, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

// 3. Xác thực chữ ký HMAC-SHA256 để chống hack / giả mạo gói nạp
$signatureHeader = isset($_SERVER['HTTP_X_GATEWAY_SIGNATURE']) ? $_SERVER['HTTP_X_GATEWAY_SIGNATURE'] : null;
$isValid = $client->verifyCallback($data, $signatureHeader);

if (!$isValid) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid signature']);
    exit;
}

// 4. Lấy thông tin thanh toán
$orderCode   = $data['orderCode'];
$userId      = $data['userId'];
$serverId    = $data['serverId'];
$amount      = $data['amount'];
$itemPackage = $data['itemPackage'];
$txRef       = isset($data['transaction']['referenceCode']) ? $data['transaction']['referenceCode'] : '';

// 5. Thao tác nghiệp vụ Game: Kiểm tra nhân vật & cộng Kim Cương / Kích hoạt gói nạp
/*
    // Ví dụ kết nối MySQL Game:
    $db = new PDO("mysql:host=127.0.0.1;dbname=sanguo_game", "root", "");
    
    // Kiểm tra idempotency (đơn đã nạp chưa)
    $check = $db->prepare("SELECT id FROM tb_recharge_log WHERE order_code = ?");
    $check->execute([$orderCode]);
    if ($check->fetch()) {
        echo json_encode(['success' => true, 'message' => 'Already processed']);
        exit;
    }

    // Cộng Kim Cương hoặc kích hoạt VIP
    $diamonds = $amount * 10; // Tỉ lệ quy đổi
    $update = $db->prepare("UPDATE tb_player SET diamond = diamond + ? WHERE player_id = ?");
    $update->execute([$diamonds, $userId]);
    
    // Lưu lịch sử
    $log = $db->prepare("INSERT INTO tb_recharge_log (order_code, player_id, amount, tx_ref) VALUES (?, ?, ?, ?)");
    $log->execute([$orderCode, $userId, $amount, $txRef]);
*/

// 6. Trả kết quả thành công cho Gateway
echo json_encode([
    'success' => true,
    'message' => 'Game balance credited successfully',
    'orderCode' => $orderCode,
    'creditedUserId' => $userId,
    'creditedAmount' => $amount
]);
