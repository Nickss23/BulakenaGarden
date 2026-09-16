<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/paymongo_config.php';
require_once __DIR__ . '/../../includes/order_payment_helpers.php';

header('Content-Type: application/json; charset=utf-8');

function return_payment_log(string $message): void
{
    $logDir = __DIR__ . '/../../logs';
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    file_put_contents($logDir . '/paymongo_return.log', '[' . date('Y-m-d H:i:s') . '] ' . $message . "\n", FILE_APPEND);
}

function return_json(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function return_paymongo_secret_key(): string
{
    if (defined('PAYMONGO_SECRET_KEY') && is_string(PAYMONGO_SECRET_KEY) && trim(PAYMONGO_SECRET_KEY) !== '') {
        return trim(PAYMONGO_SECRET_KEY);
    }

    foreach ([
        getenv('PAYMONGO_SECRET_KEY'),
        getenv('PAYMONGO_API_KEY'),
        getenv('PAYMONGO_LIVE_SECRET_KEY'),
        getenv('PAYMONGO_TEST_SECRET_KEY'),
        $_ENV['PAYMONGO_SECRET_KEY'] ?? null,
        $_SERVER['PAYMONGO_SECRET_KEY'] ?? null,
    ] as $candidate) {
        if (is_string($candidate) && trim($candidate) !== '') {
            return trim($candidate);
        }
    }

    return '';
}

function return_fetch_paymongo_checkout_session(string $sessionId): array
{
    $secretKey = return_paymongo_secret_key();
    if ($secretKey === '') {
        return ['success' => false, 'message' => 'PAYMONGO_SECRET_KEY is not configured.'];
    }

    $ch = curl_init('https://api.paymongo.com/v1/checkout_sessions/' . rawurlencode($sessionId));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPGET => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Basic ' . base64_encode($secretKey . ':'),
        ],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 20,
    ]);

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($responseBody === false || $curlError !== '') {
        return ['success' => false, 'message' => 'Could not contact PayMongo.', 'details' => $curlError ?: 'Unknown cURL error'];
    }

    $decoded = json_decode((string)$responseBody, true);
    if (!is_array($decoded) || $httpStatus >= 400) {
        return ['success' => false, 'message' => 'PayMongo could not verify the checkout session.', 'http_status' => $httpStatus];
    }

    return ['success' => true, 'session' => $decoded];
}

function return_paymongo_session_is_paid(array $session): bool
{
    $attrs = is_array($session['data']['attributes'] ?? null) ? $session['data']['attributes'] : [];
    $statuses = [
        strtolower(trim((string)($attrs['status'] ?? ''))),
        strtolower(trim((string)($attrs['payment_status'] ?? ''))),
        strtolower(trim((string)($attrs['payment_intent']['attributes']['status'] ?? ''))),
    ];

    if (!empty($attrs['payments']) && is_array($attrs['payments'])) {
        foreach ($attrs['payments'] as $payment) {
            $paymentAttrs = is_array($payment['attributes'] ?? null) ? $payment['attributes'] : [];
            $statuses[] = strtolower(trim((string)($paymentAttrs['status'] ?? '')));
        }
    }

    foreach ($statuses as $status) {
        if (in_array($status, ['paid', 'succeeded', 'success', 'completed', 'complete'], true)) {
            return true;
        }
    }

    return false;
}

function return_paymongo_session_order_ref(array $session): string
{
    $attrs = is_array($session['data']['attributes'] ?? null) ? $session['data']['attributes'] : [];
    $metadata = is_array($attrs['metadata'] ?? null) ? $attrs['metadata'] : [];
    if (!empty($metadata['order_ref'])) {
        return trim((string)$metadata['order_ref']);
    }

    if (!empty($attrs['payments']) && is_array($attrs['payments'])) {
        foreach ($attrs['payments'] as $payment) {
            $paymentAttrs = is_array($payment['attributes'] ?? null) ? $payment['attributes'] : [];
            $paymentMetadata = is_array($paymentAttrs['metadata'] ?? null) ? $paymentAttrs['metadata'] : [];
            if (!empty($paymentMetadata['order_ref'])) {
                return trim((string)$paymentMetadata['order_ref']);
            }
        }
    }

    return '';
}

function return_normalize_sizes($rawSizes): array
{
    if (is_string($rawSizes) && $rawSizes !== '') {
        $decoded = json_decode($rawSizes, true);
        $rawSizes = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($rawSizes)) return [];

    $sizes = [];
    foreach ($rawSizes as $entry) {
        if (!is_array($entry)) continue;
        $label = trim((string)($entry['label'] ?? $entry['size'] ?? $entry['name'] ?? ''));
        if ($label === '') continue;
        $sizes[] = [
            'label' => $label,
            'price' => isset($entry['price']) ? (float)$entry['price'] : 0,
            'stock' => isset($entry['stock']) ? max(0, (int)$entry['stock']) : 0,
        ];
    }
    return $sizes;
}

function return_sizes_total(array $sizes): int
{
    return array_reduce($sizes, function ($sum, $entry) {
        return $sum + max(0, (int)($entry['stock'] ?? 0));
    }, 0);
}

function return_deduct_stock(mysqli $conn, int $orderDbId, string $orderRef): int
{
    $stmt = $conn->prepare("SELECT product_id, qty FROM `order_items` WHERE order_id = ?");
    if (!$stmt) {
        return_payment_log('Could not prepare order item lookup: ' . $conn->error);
        return 0;
    }

    $stmt->bind_param('i', $orderDbId);
    $stmt->execute();
    $res = method_exists($stmt, 'get_result') ? $stmt->get_result() : null;
    $items = [];
    if ($res instanceof mysqli_result) {
        while ($row = $res->fetch_assoc()) {
            $productId = (int)($row['product_id'] ?? 0);
            $qty = (int)($row['qty'] ?? 0);
            if ($productId > 0 && $qty > 0) {
                $items[] = ['product_id' => $productId, 'qty' => $qty];
            }
        }
        $res->free();
    }
    $stmt->close();

    $count = 0;
    foreach ($items as $item) {
        $productId = (int)$item['product_id'];
        $qty = (int)$item['qty'];

        $productStmt = $conn->prepare("SELECT stock, sizes_json FROM `products` WHERE id = ? LIMIT 1");
        if (!$productStmt) continue;
        $productStmt->bind_param('i', $productId);
        $productStmt->execute();
        $productRes = method_exists($productStmt, 'get_result') ? $productStmt->get_result() : null;
        $product = $productRes instanceof mysqli_result ? $productRes->fetch_assoc() : null;
        if ($productRes instanceof mysqli_result) $productRes->free();
        $productStmt->close();
        if (!is_array($product)) continue;

        $before = (int)($product['stock'] ?? 0);
        $after = max(0, $before - $qty);
        $sizes = return_normalize_sizes($product['sizes_json'] ?? '');
        $sizesJson = null;

        if (!empty($sizes)) {
            $remaining = $qty;
            foreach ($sizes as &$size) {
                if ($remaining <= 0) break;
                $current = max(0, (int)($size['stock'] ?? 0));
                $take = min($current, $remaining);
                $size['stock'] = $current - $take;
                $remaining -= $take;
            }
            unset($size);
            $after = return_sizes_total($sizes);
            $sizesJson = json_encode($sizes, JSON_UNESCAPED_UNICODE);
        }

        $updateStmt = $conn->prepare("UPDATE `products` SET stock = ?, sizes_json = ? WHERE id = ?");
        if (!$updateStmt) continue;
        $updateStmt->bind_param('isi', $after, $sizesJson, $productId);
        if ($updateStmt->execute()) {
            $count++;
            return_payment_log("Stock deducted for return {$orderRef}: product {$productId}, before={$before}, qty={$qty}, after={$after}");
        }
        $updateStmt->close();
    }

    return $count;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        return_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    $input = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($input)) $input = $_POST;

    $orderRef = trim((string)($input['order_ref'] ?? $input['order'] ?? ''));
    $sessionId = trim((string)($input['session_id'] ?? $input['checkout_session_id'] ?? ''));
    if ($orderRef === '') {
        return_json(422, ['success' => false, 'message' => 'Missing order reference']);
    }
    if (!isset($conn) || !($conn instanceof mysqli)) {
        return_json(500, ['success' => false, 'message' => 'Database connection not available']);
    }

    bg_ensure_order_tables($conn);

    $ordersCols = [];
    $colResult = $conn->query("SHOW COLUMNS FROM `orders`");
    if ($colResult instanceof mysqli_result) {
        while ($col = $colResult->fetch_assoc()) {
            $ordersCols[] = (string)($col['Field'] ?? '');
        }
        $colResult->free();
    }

    $lookupCols = ['id', 'status'];
    if (in_array('paymongo_session_id', $ordersCols, true)) {
        $lookupCols[] = 'paymongo_session_id';
    }

    $lookup = $conn->prepare("SELECT `" . implode('`, `', $lookupCols) . "` FROM `orders` WHERE `order_ref` = ? LIMIT 1");
    if (!$lookup) {
        return_json(500, ['success' => false, 'message' => 'Could not prepare order lookup']);
    }
    $lookup->bind_param('s', $orderRef);
    $lookup->execute();
    $lookupRes = method_exists($lookup, 'get_result') ? $lookup->get_result() : null;
    $order = $lookupRes instanceof mysqli_result ? $lookupRes->fetch_assoc() : null;
    if ($lookupRes instanceof mysqli_result) $lookupRes->free();
    $lookup->close();

    $pendingCheckout = [];
    if (!is_array($order)) {
        $pendingCheckout = bg_load_pending_checkout($orderRef, $sessionId);
        if (!empty($pendingCheckout)) {
            $order = [
                'id' => 0,
                'status' => 'pending',
                'paymongo_session_id' => (string)($pendingCheckout['paymongo_session_id'] ?? ''),
            ];
        } else {
            return_payment_log("Paid return for {$orderRef}, but order was not found and no pending checkout payload exists");
            return_json(404, ['success' => false, 'message' => 'Order payment details not found']);
        }
    }

    if ($sessionId === '' && !empty($order['paymongo_session_id'])) {
        $sessionId = trim((string)$order['paymongo_session_id']);
    }

    if ($sessionId === '') {
        return_payment_log("Return success for {$orderRef}, but no PayMongo session_id was available");
        return_json(422, ['success' => false, 'message' => 'Missing PayMongo session ID. Please wait for the payment webhook or contact the shop.']);
    }

    $sessionResult = return_fetch_paymongo_checkout_session($sessionId);
    if (empty($sessionResult['success'])) {
        return_payment_log("Could not verify PayMongo session {$sessionId} for {$orderRef}: " . ($sessionResult['message'] ?? 'Unknown error'));
        return_json(502, ['success' => false, 'message' => $sessionResult['message'] ?? 'Could not verify payment.']);
    }

    $paymongoSession = is_array($sessionResult['session'] ?? null) ? $sessionResult['session'] : [];
    $sessionOrderRef = return_paymongo_session_order_ref($paymongoSession);
    if ($sessionOrderRef !== '' && !hash_equals($sessionOrderRef, $orderRef)) {
        return_payment_log("PayMongo session {$sessionId} order mismatch. Expected {$orderRef}, got {$sessionOrderRef}");
        return_json(409, ['success' => false, 'message' => 'Payment session does not match this order.']);
    }
    if (!return_paymongo_session_is_paid($paymongoSession)) {
        return_payment_log("PayMongo session {$sessionId} for {$orderRef} is not paid yet");
        return_json(409, ['success' => false, 'message' => 'Payment is not confirmed by PayMongo yet. Please refresh in a moment.']);
    }

    $previousStatus = strtolower(trim((string)($order['status'] ?? 'pending')));
    $orderDbId = (int)($order['id'] ?? 0);
    $orderCreated = false;

    if ($orderDbId <= 0) {
        if (empty($pendingCheckout)) {
            $pendingCheckout = bg_load_pending_checkout($orderRef, $sessionId);
        }
        try {
            $createdOrder = bg_create_order_from_paid_checkout($conn, $pendingCheckout, $orderRef, $sessionId);
            $orderDbId = (int)($createdOrder['id'] ?? 0);
            $previousStatus = strtolower(trim((string)($createdOrder['status'] ?? 'pending')));
            $orderCreated = !empty($createdOrder['created']);
        } catch (Throwable $createError) {
            return_payment_log("Could not create paid return order {$orderRef}: " . $createError->getMessage());
            return_json(500, ['success' => false, 'message' => 'Payment was verified, but the order could not be created.']);
        }
    }

    $stmt = $conn->prepare("UPDATE `orders` SET payment_method = 'GCash QRPH' WHERE `order_ref` = ?");
    if (!$stmt) {
        return_json(500, ['success' => false, 'message' => 'Could not prepare order update']);
    }
    $stmt->bind_param('s', $orderRef);
    $stmt->execute();
    $stmt->close();

    return_payment_log("Payment recorded for {$orderRef}; session={$sessionId}; status_left_as={$previousStatus}");
    bg_delete_pending_checkout($orderRef, $sessionId);

    echo json_encode([
        'success' => true,
        'message' => 'Payment recorded. Order is waiting for admin confirmation.',
        'order_updated' => true,
        'order_created' => $orderCreated,
        'previous_status' => $previousStatus,
        'status' => $previousStatus,
        'stock_adjusted' => false,
        'stock_adjusted_count' => 0,
    ]);
} catch (Throwable $e) {
    return_payment_log('EXCEPTION: ' . $e->getMessage());
    return_json(500, ['success' => false, 'message' => 'Server error']);
}
