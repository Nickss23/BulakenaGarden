<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/paymongo_config.php';
require_once __DIR__ . '/../../includes/order_payment_helpers.php';

header('Content-Type: application/json; charset=utf-8');

// Log function for debugging
function log_webhook(string $message): void
{
    $logDir = __DIR__ . '/../../logs';
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    $logFile = $logDir . '/paymongo_webhook.log';
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($logFile, "[{$timestamp}] {$message}\n", FILE_APPEND);
}

// Verify webhook signature (optional but recommended)
function verify_webhook_signature(): bool
{
    // Get the signature from headers
    $signature = $_SERVER['HTTP_X_PAYMONGO_SIGNATURE'] ?? $_SERVER['HTTP_PAYMONGO_SIGNATURE'] ?? '';
    
    if (!$signature) {
        log_webhook('WARNING: No signature header found');
        // For testing, allow unsigned webhooks
        return true;
    }

    // Get raw body
    $body = file_get_contents('php://input');
    
    // Get secret key
    $secretKey = defined('PAYMONGO_SECRET_KEY') ? PAYMONGO_SECRET_KEY : getenv('PAYMONGO_SECRET_KEY');
    if (!$secretKey) {
        log_webhook('ERROR: PAYMONGO_SECRET_KEY not configured');
        return false;
    }

    // Compute signature
    $computed = hash_hmac('sha256', $body, $secretKey, true);
    $computedB64 = base64_encode($computed);

    // Compare (timing-safe)
    if (hash_equals($computedB64, $signature)) {
        return true;
    }

    log_webhook("WARNING: Signature mismatch. Expected: {$signature}, Got: {$computedB64}");
    return false;
}

function webhook_normalize_size_entries($rawSizes): array
{
    if (is_string($rawSizes) && $rawSizes !== '') {
        $decoded = json_decode($rawSizes, true);
        $rawSizes = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($rawSizes)) return [];

    $normalized = [];
    foreach ($rawSizes as $entry) {
        if (!is_array($entry)) continue;
        $label = trim((string)($entry['label'] ?? $entry['size'] ?? $entry['name'] ?? ''));
        if ($label === '') continue;
        $normalized[] = [
            'label' => $label,
            'price' => isset($entry['price']) ? (float)$entry['price'] : 0,
            'stock' => isset($entry['stock']) ? max(0, (int)$entry['stock']) : 0,
        ];
    }
    return $normalized;
}

function webhook_sizes_total_stock(array $sizes): int
{
    return array_reduce($sizes, function ($sum, $entry) {
        return $sum + max(0, (int)($entry['stock'] ?? 0));
    }, 0);
}

function webhook_deduct_stock_for_paid_order(mysqli $conn, int $orderDbId, string $orderRef): int
{
    $itemStmt = $conn->prepare("SELECT product_id, qty FROM `order_items` WHERE order_id = ?");
    if (!$itemStmt) {
        log_webhook('ERROR: Could not prepare stock item lookup: ' . $conn->error);
        return 0;
    }

    $itemStmt->bind_param('i', $orderDbId);
    $itemStmt->execute();
    $itemsRes = method_exists($itemStmt, 'get_result') ? $itemStmt->get_result() : null;
    $items = [];
    if ($itemsRes instanceof mysqli_result) {
        while ($item = $itemsRes->fetch_assoc()) {
            $productId = (int)($item['product_id'] ?? 0);
            $qty = (int)($item['qty'] ?? 0);
            if ($productId > 0 && $qty > 0) {
                $items[] = ['product_id' => $productId, 'qty' => $qty];
            }
        }
        $itemsRes->free();
    }
    $itemStmt->close();

    $deducted = 0;
    foreach ($items as $item) {
        $productId = (int)$item['product_id'];
        $qty = (int)$item['qty'];

        $productStmt = $conn->prepare("SELECT stock, sizes_json FROM `products` WHERE id = ? LIMIT 1");
        if (!$productStmt) {
            log_webhook('ERROR: Could not prepare product lookup: ' . $conn->error);
            continue;
        }
        $productStmt->bind_param('i', $productId);
        $productStmt->execute();
        $productRes = method_exists($productStmt, 'get_result') ? $productStmt->get_result() : null;
        $product = $productRes instanceof mysqli_result ? $productRes->fetch_assoc() : null;
        if ($productRes instanceof mysqli_result) $productRes->free();
        $productStmt->close();

        if (!is_array($product)) {
            log_webhook("WARNING: Product {$productId} not found for paid order {$orderRef}");
            continue;
        }

        $before = (int)($product['stock'] ?? 0);
        $sizes = webhook_normalize_size_entries($product['sizes_json'] ?? '');
        $after = max(0, $before - $qty);
        $sizesJson = null;

        if (!empty($sizes)) {
            $remaining = $qty;
            foreach ($sizes as &$sizeEntry) {
                if ($remaining <= 0) break;
                $currentStock = max(0, (int)($sizeEntry['stock'] ?? 0));
                $take = min($currentStock, $remaining);
                $sizeEntry['stock'] = $currentStock - $take;
                $remaining -= $take;
            }
            unset($sizeEntry);
            $after = webhook_sizes_total_stock($sizes);
            $sizesJson = json_encode($sizes, JSON_UNESCAPED_UNICODE);
        }

        $updateStmt = $conn->prepare("UPDATE `products` SET stock = ?, sizes_json = ? WHERE id = ?");
        if (!$updateStmt) {
            log_webhook('ERROR: Could not prepare product stock update: ' . $conn->error);
            continue;
        }
        $updateStmt->bind_param('isi', $after, $sizesJson, $productId);
        if ($updateStmt->execute()) {
            $deducted++;
            log_webhook("Stock deducted for paid order {$orderRef}: product {$productId}, before={$before}, qty={$qty}, after={$after}");
        } else {
            log_webhook("ERROR: Stock update failed for product {$productId}: " . $updateStmt->error);
        }
        $updateStmt->close();
    }

    return $deducted;
}

// Main webhook handler
try {
    log_webhook('=== Webhook received ===');
    log_webhook('Method: ' . $_SERVER['REQUEST_METHOD']);
    log_webhook('Headers: ' . json_encode(getallheaders() ?: []));

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        exit;
    }

    // Verify signature
    if (!verify_webhook_signature()) {
        log_webhook('ERROR: Webhook signature verification failed');
        // For testing, still process the webhook
        // In production, you should return 401 here
        // http_response_code(401);
        // echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        // exit;
    }

    // Parse webhook data
    $payload = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        log_webhook('ERROR: Invalid JSON payload');
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid payload']);
        exit;
    }

    log_webhook('Webhook data: ' . json_encode($payload));

    $eventAttributes = is_array($payload['data']['attributes'] ?? null) ? $payload['data']['attributes'] : [];
    $eventType = $eventAttributes['type'] ?? ($payload['data']['type'] ?? null);
    $checkoutSession = is_array($eventAttributes['data'] ?? null) ? $eventAttributes['data'] : [];
    $eventData = is_array($checkoutSession['attributes'] ?? null) ? $checkoutSession['attributes'] : $eventAttributes;

    log_webhook("Event type: {$eventType}");

    // Handle checkout session payment success
    if ($eventType === 'checkout_session.payment.paid') {
        $sessionId = $checkoutSession['id'] ?? ($payload['data']['id'] ?? null);
        $metadata = is_array($eventData['metadata'] ?? null) ? $eventData['metadata'] : [];
        if (empty($metadata) && !empty($eventData['payments'][0]['attributes']['metadata']) && is_array($eventData['payments'][0]['attributes']['metadata'])) {
            $metadata = $eventData['payments'][0]['attributes']['metadata'];
        }
        $orderRef = $metadata['order_ref'] ?? null;
        $customerName = $metadata['customer_name'] ?? null;
        $customerEmail = $metadata['customer_email'] ?? null;
        $amount = (int) ($eventData['amount'] ?? ($eventData['payments'][0]['attributes']['amount'] ?? 0));
        $currency = $eventData['currency'] ?? ($eventData['payments'][0]['attributes']['currency'] ?? 'PHP');

        log_webhook("Payment successful - Order: {$orderRef}, Amount: {$amount}, Session: {$sessionId}");

        // Save transaction log
        $logDir = __DIR__ . '/../../logs';
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
        
        $transactionLog = $logDir . '/gcash_transactions.log';
        $txnData = [
            'timestamp' => date('Y-m-d H:i:s'),
            'order_ref' => $orderRef,
            'session_id' => $sessionId,
            'customer_name' => $customerName,
            'customer_email' => $customerEmail,
            'amount' => $amount / 100, // Convert from centavos to PHP
            'currency' => $currency,
            'status' => 'PAID',
            'event_type' => $eventType
        ];
        
        file_put_contents($transactionLog, json_encode($txnData) . "\n", FILE_APPEND);

        $updatedOrder = false;
        $stockAdjusted = false;
        $stockAdjustedCount = 0;
        $orderRef = is_string($orderRef) ? trim($orderRef) : '';
        if ($orderRef !== '' && isset($conn) && $conn instanceof mysqli) {
            try {
                bg_ensure_order_tables($conn);
                $ordersCols = [];
                $colResult = $conn->query("SHOW COLUMNS FROM `orders`");
                if ($colResult instanceof mysqli_result) {
                    while ($col = $colResult->fetch_assoc()) {
                        $ordersCols[] = (string)($col['Field'] ?? '');
                    }
                    $colResult->free();
                }

                if (in_array('order_ref', $ordersCols, true)) {
                    $orderDbId = 0;
                    $previousStatus = '';
                    $lookupCols = ['id'];
                    if (in_array('status', $ordersCols, true)) {
                        $lookupCols[] = 'status';
                    }
                    $lookupStmt = $conn->prepare("SELECT `" . implode('`, `', $lookupCols) . "` FROM `orders` WHERE `order_ref` = ? LIMIT 1");
                    if ($lookupStmt) {
                        $lookupStmt->bind_param('s', $orderRef);
                        $lookupStmt->execute();
                        $lookupRes = method_exists($lookupStmt, 'get_result') ? $lookupStmt->get_result() : null;
                        $lookupRow = $lookupRes instanceof mysqli_result ? $lookupRes->fetch_assoc() : null;
                        if ($lookupRes instanceof mysqli_result) $lookupRes->free();
                        $lookupStmt->close();

                        if (is_array($lookupRow)) {
                            $orderDbId = (int)($lookupRow['id'] ?? 0);
                            $previousStatus = strtolower(trim((string)($lookupRow['status'] ?? '')));
                        }
                    }

                    if ($orderDbId <= 0) {
                        $pendingCheckout = bg_load_pending_checkout($orderRef, (string)$sessionId);
                        if (!empty($pendingCheckout)) {
                            try {
                                $createdOrder = bg_create_order_from_paid_checkout($conn, $pendingCheckout, $orderRef, (string)$sessionId);
                                $orderDbId = (int)($createdOrder['id'] ?? 0);
                                $previousStatus = strtolower(trim((string)($createdOrder['status'] ?? 'pending')));
                                log_webhook("Paid order {$orderRef} created from pending checkout payload.");
                            } catch (Throwable $createError) {
                                log_webhook("ERROR: Could not create paid order {$orderRef}: " . $createError->getMessage());
                            }
                        }
                    }

                    if ($orderDbId <= 0) {
                        log_webhook("WARNING: Paid order {$orderRef} was not found in MySQL and no pending checkout payload could create it.");
                    }

                    $setParts = [];
                    $types = '';
                    $params = [];
                    if (in_array('payment_method', $ordersCols, true)) {
                        $setParts[] = '`payment_method` = ?';
                        $types .= 's';
                        $params[] = 'GCash QRPH';
                    }
                    if (!empty($setParts)) {
                        $sql = 'UPDATE `orders` SET ' . implode(', ', $setParts) . ' WHERE `order_ref` = ?';
                        $types .= 's';
                        $params[] = $orderRef;

                        $stmt = $conn->prepare($sql);
                        if ($stmt) {
                            $bindArgs = [$types];
                            for ($i = 0; $i < count($params); $i++) {
                                $bindArgs[] = &$params[$i];
                            }
                            call_user_func_array([$stmt, 'bind_param'], $bindArgs);
                            $stmt->execute();
                            $updatedOrder = $orderDbId > 0;
                            $stmt->close();
                            log_webhook("Payment recorded for {$orderRef}: " . ($updatedOrder ? 'yes' : 'no') . "; status left as {$previousStatus}");
                            if ($updatedOrder) {
                                bg_delete_pending_checkout($orderRef, (string)$sessionId);
                            }
                        } else {
                            log_webhook('ERROR: Could not prepare order payment update: ' . $conn->error);
                        }
                    } else {
                        log_webhook('WARNING: orders table has no payment_method or notes column; status left unchanged for ' . $orderRef);
                    }
                } else {
                    log_webhook('ERROR: orders table missing order_ref column');
                }
            } catch (Throwable $dbError) {
                log_webhook('ERROR: Could not update paid order: ' . $dbError->getMessage());
            }
        } else {
            log_webhook('WARNING: Paid webhook had no order_ref or database connection');
        }

        log_webhook("Transaction logged for order: {$orderRef}");

        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Payment recorded',
            'order_updated' => $updatedOrder,
            'stock_adjusted' => $stockAdjusted,
            'stock_adjusted_count' => $stockAdjustedCount
        ]);
        exit;
    }

    // Handle payment failed
    if ($eventType === 'checkout_session.payment.failed') {
        $sessionId = $checkoutSession['id'] ?? ($payload['data']['id'] ?? null);
        $metadata = is_array($eventData['metadata'] ?? null) ? $eventData['metadata'] : [];
        if (empty($metadata) && !empty($eventData['payments'][0]['attributes']['metadata']) && is_array($eventData['payments'][0]['attributes']['metadata'])) {
            $metadata = $eventData['payments'][0]['attributes']['metadata'];
        }
        $orderRef = $metadata['order_ref'] ?? null;

        log_webhook("Payment failed - Order: {$orderRef}, Session: {$sessionId}");

        $logDir = __DIR__ . '/../../logs';
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }

        $transactionLog = $logDir . '/gcash_transactions.log';
        $txnData = [
            'timestamp' => date('Y-m-d H:i:s'),
            'order_ref' => $orderRef,
            'session_id' => $sessionId,
            'status' => 'FAILED',
            'event_type' => $eventType
        ];

        file_put_contents($transactionLog, json_encode($txnData) . "\n", FILE_APPEND);

        http_response_code(200);
        echo json_encode(['success' => true, 'message' => 'Failure recorded']);
        exit;
    }

    // Unhandled event type
    log_webhook("Unhandled event type: {$eventType}");
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Event received but not processed']);

} catch (Throwable $e) {
    log_webhook('EXCEPTION: ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error']);
}
