<?php
header('Content-Type: application/json; charset=utf-8');
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        exit;
    }

    $orderId = isset($_POST['orderId']) ? trim($_POST['orderId']) : '';
    if ($orderId === '') {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Missing orderId']);
        exit;
    }

    $ordersDir = __DIR__ . '/../../orders/';
    if (!is_dir($ordersDir)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Orders directory not found']);
        exit;
    }

    // find file similar to update_order_status logic
    $candidate = $ordersDir . $orderId . '.json';
    $found = '';
    if (is_file($candidate)) {
        $found = $candidate;
    } else {
        $files = glob($ordersDir . '*.json');
        foreach ($files as $f) {
            $json = @file_get_contents($f);
            if (!$json) continue;
            $obj = json_decode($json, true);
            if (!$obj) continue;
            if ((isset($obj['orderId']) && $obj['orderId'] === $orderId) || (isset($obj['order_ref']) && $obj['order_ref'] === $orderId)) { $found = $f; break; }
        }
    }

    if ($found === '') {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Order not found']);
        exit;
    }

    $json = @file_get_contents($found);
    if (!$json) { http_response_code(500); echo json_encode(['success'=>false,'message'=>'Could not read order file']); exit; }
    $obj = json_decode($json, true);
    if (!$obj) { http_response_code(500); echo json_encode(['success'=>false,'message'=>'Invalid order JSON']); exit; }

    // extract phone
    $phone = null;
    if (isset($obj['customer']) && is_array($obj['customer'])) {
        if (!empty($obj['customer']['phone'])) $phone = $obj['customer']['phone'];
    }
    if (!$phone && isset($obj['phone'])) $phone = $obj['phone'];

    if (!$phone) {
        echo json_encode(['success' => false, 'message' => 'No phone number on order']);
        exit;
    }

    include_once __DIR__ . '/../../includes/sms_helper.php';
    if (!function_exists('normalize_phone_e164') || !function_exists('send_sms')) {
        echo json_encode(['success' => false, 'message' => 'SMS helper not available']);
        exit;
    }

    $to = normalize_phone_e164($phone);
    if (!$to) {
        echo json_encode(['success' => false, 'message' => 'Phone normalization failed']);
        exit;
    }

    // send the exact confirmation message requested
    $msg = function_exists('build_order_confirm_sms')
        ? build_order_confirm_sms($orderId, $obj)
        : "Good day. Your order ($orderId) has been confirmed and is now being processed.";
    $ok = send_sms($to, $msg);

    // update order JSON metadata
    $obj['sms_retry_count'] = isset($obj['sms_retry_count']) ? intval($obj['sms_retry_count']) + 1 : 1;
    $obj['last_sms_sent_at'] = date('Y-m-d H:i:s');
    $obj['last_sms_status'] = $ok ? 'sent' : 'failed';
    file_put_contents($found, json_encode($obj, JSON_PRETTY_PRINT));

    echo json_encode(['success' => $ok, 'message' => $ok ? 'SMS sent' : 'SMS failed', 'to' => $to]);
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
    exit;
}
