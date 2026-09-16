<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
require_once __DIR__ . '/../../includes/config.php';
auth_require_admin_or_app_json();

header('Content-Type: application/json; charset=utf-8');

function normalize_size_entries($rawSizes) {
    if (is_string($rawSizes) && $rawSizes !== '') {
        $decoded = json_decode($rawSizes, true);
        $rawSizes = is_array($decoded) ? $decoded : [];
    }

    if (!is_array($rawSizes)) {
        return [];
    }

    $normalized = [];
    foreach ($rawSizes as $entry) {
        if (!is_array($entry)) continue;
        $label = trim((string)($entry['label'] ?? $entry['size'] ?? $entry['name'] ?? ''));
        $price = isset($entry['price']) ? (float)$entry['price'] : 0;
        $stock = isset($entry['stock']) ? max(0, (int)$entry['stock']) : 0;
        if ($label === '') continue;
        $normalized[] = [
            'label' => $label,
            'price' => $price,
            'stock' => $stock
        ];
    }

    return $normalized;
}

function get_item_product_id($item) {
    if (!is_array($item)) return 0;
    if (!empty($item['id'])) return (int)$item['id'];
    if (!empty($item['product_id'])) return (int)$item['product_id'];
    if (!empty($item['productId'])) return (int)$item['productId'];
    if (!empty($item['product']) && is_array($item['product']) && !empty($item['product']['id'])) {
        return (int)$item['product']['id'];
    }
    return 0;
}

function get_item_qty($item) {
    if (!is_array($item)) return 0;
    foreach (['qty', 'quantity', 'count', 'quantityOrdered'] as $key) {
        if (isset($item[$key])) {
            $qty = (int)$item[$key];
            if ($qty > 0) return $qty;
        }
    }
    return 0;
}

function get_item_size_label($item) {
    if (!is_array($item)) return '';
    foreach (['sizeLabel', 'size_label', 'selectedSize', 'selected_size'] as $key) {
        if (!isset($item[$key])) continue;
        if (is_array($item[$key])) {
            $label = trim((string)($item[$key]['label'] ?? ''));
        } else {
            $label = trim((string)$item[$key]);
        }
        if ($label !== '') return $label;
    }
    return '';
}

function calculate_sizes_total_stock(array $sizes): int {
    return array_reduce($sizes, function ($sum, $entry) {
        return $sum + max(0, (int)($entry['stock'] ?? 0));
    }, 0);
}

function adjust_product_stock(mysqli $conn, int $productId, int $qty, string $sizeLabel, bool $restore): ?array {
    static $sel = null;
    static $upd = null;

    if ($sel === null) {
        $sel = $conn->prepare('SELECT stock, sizes_json FROM products WHERE id = ? LIMIT 1');
    }
    if ($upd === null) {
        $upd = $conn->prepare('UPDATE products SET stock = ?, sizes_json = ? WHERE id = ?');
    }
    if (!$sel || !$upd) {
        throw new RuntimeException('Could not prepare stock adjustment statements.');
    }

    $sel->bind_param('i', $productId);
    $sel->execute();
    $res = method_exists($sel, 'get_result') ? $sel->get_result() : null;
    $row = $res ? $res->fetch_assoc() : null;
    if ($res) {
        $res->free();
    }
    if (!is_array($row)) {
        return null;
    }

    $before = isset($row['stock']) ? (int)$row['stock'] : 0;
    $sizesBefore = normalize_size_entries($row['sizes_json'] ?? []);
    $sizesAfter = $sizesBefore;
    $matchedSize = '';

    if (!empty($sizesAfter) && $sizeLabel !== '') {
        foreach ($sizesAfter as &$sizeEntry) {
            if (strcasecmp((string)$sizeEntry['label'], $sizeLabel) !== 0) {
                continue;
            }
            $matchedSize = (string)$sizeEntry['label'];
            $currentStock = max(0, (int)($sizeEntry['stock'] ?? 0));
            $sizeEntry['stock'] = $restore
                ? $currentStock + $qty
                : max(0, $currentStock - $qty);
            break;
        }
        unset($sizeEntry);
    }

    $after = !empty($sizesAfter)
        ? calculate_sizes_total_stock($sizesAfter)
        : ($restore ? ($before + $qty) : max(0, $before - $qty));

    $sizesJson = !empty($sizesAfter) ? json_encode($sizesAfter, JSON_UNESCAPED_UNICODE) : null;
    $upd->bind_param('isi', $after, $sizesJson, $productId);
    if (!$upd->execute()) {
        throw new RuntimeException('Stock update failed for product ' . $productId . ': ' . ($upd->error ?: $conn->error));
    }

    return [
        'id' => $productId,
        'qty' => $qty,
        'sizeLabel' => $matchedSize !== '' ? $matchedSize : $sizeLabel,
        'before' => $before,
        'after' => $after,
        'sizes_before' => $sizesBefore,
        'sizes_after' => $sizesAfter,
    ];
}

function sync_order_stock(mysqli $conn, string $orderId, array $order, bool $restore): array {
    $adjustments = [];
    $items = isset($order['items']) && is_array($order['items']) ? $order['items'] : [];
    foreach ($items as $index => $item) {
        $pid = get_item_product_id($item);
        $qty = get_item_qty($item);
        $fallbackSizeLabel = '';
        if (!empty($order['stock_adjustments'][$index]['sizeLabel'])) {
            $fallbackSizeLabel = (string)$order['stock_adjustments'][$index]['sizeLabel'];
        }
        $sizeLabel = get_item_size_label($item) ?: $fallbackSizeLabel;

        if ($pid <= 0 || $qty <= 0) {
            error_log(
                "Stock sync: skipping item with pid={$pid} qty={$qty} in order {$orderId}\n",
                3,
                __DIR__ . '/../../orders/status_debug.log'
            );
            continue;
        }

        $adjustment = adjust_product_stock($conn, $pid, $qty, $sizeLabel, $restore);
        if ($adjustment === null) {
            error_log(
                'Stock sync: product not found for id ' . $pid . " (order {$orderId})\n",
                3,
                __DIR__ . '/../../orders/status_debug.log'
            );
            continue;
        }

        $adjustments[] = $adjustment;
        error_log(
            ($restore ? 'Stock restored' : 'Stock adjusted') .
            " for product {$pid}: before={$adjustment['before']} qty={$qty} after={$adjustment['after']}" .
            ($adjustment['sizeLabel'] !== '' ? " size={$adjustment['sizeLabel']}" : '') .
            " (order {$orderId})\n",
            3,
            __DIR__ . '/../../orders/status_debug.log'
        );
    }

    return $adjustments;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit;
    }

    $orderId = trim((string)($_POST['orderId'] ?? $_POST['order_ref'] ?? $_POST['order_id'] ?? $_POST['id'] ?? ''));
    $status = isset($_POST['status']) ? trim($_POST['status']) : '';
    // debug log incoming requests for troubleshooting
    @error_log("update_order_status request: orderId={$orderId} status={$status}\n", 3, __DIR__ . '/../../orders/status_debug.log');
    $allowed = ['pending','confirmed','shipped','delivered','cancelled','pickedup'];
    if ($orderId === '' || $status === '' || !in_array(strtolower($status), $allowed, true)) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Invalid orderId or status']);
        exit;
    }

    try {
        if (!isset($conn) || !($conn instanceof mysqli)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Database connection not available']);
            exit;
        }

        $tableCheck = $conn->query("SHOW TABLES LIKE 'orders'");
        if (!($tableCheck instanceof mysqli_result) || $tableCheck->num_rows <= 0) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Orders table not found']);
            exit;
        }
        if ($tableCheck instanceof mysqli_result) {
            $tableCheck->free();
        }

        $orderStmt = $conn->prepare("SELECT * FROM `orders` WHERE order_ref = ? LIMIT 1");
        if (!$orderStmt) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Could not prepare order lookup']);
            exit;
        }
        $orderStmt->bind_param('s', $orderId);
        $orderStmt->execute();
        $orderRes = method_exists($orderStmt, 'get_result') ? $orderStmt->get_result() : null;
        $orderRow = $orderRes ? $orderRes->fetch_assoc() : null;
        if ($orderRes) {
            $orderRes->free();
        }
        $orderStmt->close();

        if (!is_array($orderRow) && ctype_digit($orderId)) {
            $numericOrderId = (int)$orderId;
            $orderStmt = $conn->prepare("SELECT * FROM `orders` WHERE id = ? LIMIT 1");
            if (!$orderStmt) {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Could not prepare numeric order lookup']);
                exit;
            }
            $orderStmt->bind_param('i', $numericOrderId);
            $orderStmt->execute();
            $orderRes = method_exists($orderStmt, 'get_result') ? $orderStmt->get_result() : null;
            $orderRow = $orderRes ? $orderRes->fetch_assoc() : null;
            if ($orderRes) {
                $orderRes->free();
            }
            $orderStmt->close();
        }

        if (!is_array($orderRow)) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Order not found',
                'received_orderId' => $orderId,
                'expected' => 'Send the order_ref/orderId shown in admin, for example BGGO-YYYYMMDD-HHMM-001. Numeric database id is also accepted.'
            ]);
            exit;
        }

        $items = [];
        $dbOrderId = (int) ($orderRow['id'] ?? 0);
        $orderId = trim((string)($orderRow['order_ref'] ?? $orderId));
        if ($dbOrderId > 0) {
            $itemStmt = $conn->prepare("SELECT product_id, title, price, qty FROM `order_items` WHERE order_id = ? ORDER BY id ASC");
            if ($itemStmt) {
                $itemStmt->bind_param('i', $dbOrderId);
                $itemStmt->execute();
                $itemRes = method_exists($itemStmt, 'get_result') ? $itemStmt->get_result() : null;
                if ($itemRes) {
                    while ($item = $itemRes->fetch_assoc()) {
                        $items[] = [
                            'id' => (int) ($item['product_id'] ?? 0),
                            'title' => (string) ($item['title'] ?? ''),
                            'price' => (float) ($item['price'] ?? 0),
                            'qty' => (int) ($item['qty'] ?? 0)
                        ];
                    }
                    $itemRes->free();
                }
                $itemStmt->close();
            }
        }

        $prevStatus = strtolower(trim((string) ($orderRow['status'] ?? 'pending')));
        if ($prevStatus === '') {
            $prevStatus = 'pending';
        }
        $nextStatus = strtolower($status);
        $deliveryType = strtolower(trim((string) ($orderRow['delivery_type'] ?? 'ship')));
        $isPickup = $deliveryType === 'pickup';
        if (in_array($prevStatus, ['delivered', 'pickedup', 'cancelled'], true)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Completed or cancelled orders cannot be changed.']);
            exit;
        }
        if ($nextStatus === $prevStatus) {
            echo json_encode([
                'success' => true,
                'message' => 'Order status is already ' . $nextStatus,
                'status' => $nextStatus,
                'previous_status' => $prevStatus,
                'stock_action' => 'none',
                'sms' => null
            ]);
            exit;
        }

        $allowedTransitions = $isPickup
            ? [
                'pending' => ['confirmed', 'cancelled'],
                'confirmed' => ['pickedup'],
            ]
            : [
                'pending' => ['confirmed', 'cancelled'],
                'confirmed' => ['shipped'],
                'shipped' => ['delivered'],
            ];
        if (!isset($allowedTransitions[$prevStatus]) || !in_array($nextStatus, $allowedTransitions[$prevStatus], true)) {
            http_response_code(409);
            $sequence = $isPickup
                ? 'Pending > Confirmed > Picked Up'
                : 'Pending > Confirmed > Shipped > Delivered';
            echo json_encode([
                'success' => false,
                'message' => 'Please follow the order status sequence: ' . $sequence . '.'
            ]);
            exit;
        }
        $stockAdjusted = false;

        $hasStatus = false;
        $hasStatusUpdatedAt = false;
        $statusCol = $conn->query("SHOW COLUMNS FROM `orders` LIKE 'status'");
        if ($statusCol instanceof mysqli_result) { $hasStatus = $statusCol->num_rows > 0; $statusCol->free(); }
        $updatedCol = $conn->query("SHOW COLUMNS FROM `orders` LIKE 'status_updated_at'");
        if ($updatedCol instanceof mysqli_result) { $hasStatusUpdatedAt = $updatedCol->num_rows > 0; $updatedCol->free(); }
        if ($hasStatus) {
            if ($hasStatusUpdatedAt) {
                $stmt = $conn->prepare("UPDATE `orders` SET status = ?, status_updated_at = NOW() WHERE id = ?");
            } else {
                $stmt = $conn->prepare("UPDATE `orders` SET status = ? WHERE id = ?");
            }
            if ($stmt) {
                $stmt->bind_param('si', $nextStatus, $dbOrderId);
                $stmt->execute();
                $stmt->close();
            }
        }
    } catch (Throwable $e) {
        error_log('update_order_status DB sync failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database update failed', 'error' => $e->getMessage()]);
        exit;
    }

    $obj = [
        'id' => (int) ($orderRow['id'] ?? 0),
        'orderId' => (string) ($orderRow['order_ref'] ?? $orderId),
        'order_ref' => (string) ($orderRow['order_ref'] ?? $orderId),
        'date' => !empty($orderRow['created_at']) ? date(DATE_ATOM, strtotime((string) $orderRow['created_at'])) : date(DATE_ATOM),
        'status' => $nextStatus,
        'status_updated_at' => date('Y-m-d H:i:s'),
        'deliveryType' => (string) ($orderRow['delivery_type'] ?? 'ship'),
        'shippingFee' => (float) ($orderRow['shipping_fee'] ?? 0),
        'total' => (float) ($orderRow['total'] ?? 0),
        'paymentMethod' => (string) ($orderRow['payment_method'] ?? ''),
        'notes' => (string) ($orderRow['notes'] ?? ''),
        'customer' => [
            'firstName' => (string) ($orderRow['customer_first'] ?? ''),
            'lastName' => (string) ($orderRow['customer_last'] ?? ''),
            'email' => (string) ($orderRow['customer_email'] ?? ''),
            'phone' => (string) ($orderRow['customer_phone'] ?? ($orderRow['phone'] ?? '')),
            'address' => (string) ($orderRow['customer_street_address'] ?? $orderRow['customer_address'] ?? ''),
            'street_address' => (string) ($orderRow['customer_street_address'] ?? $orderRow['customer_address'] ?? ''),
            'apartment' => (string) ($orderRow['customer_apartment'] ?? ''),
            'barangay' => (string) ($orderRow['customer_barangay'] ?? ''),
            'municipality' => (string) ($orderRow['customer_municipality'] ?? ''),
            'province' => (string) ($orderRow['customer_province'] ?? ''),
            'region' => (string) ($orderRow['customer_region'] ?? ''),
            'postalCode' => (string) ($orderRow['customer_postal_code'] ?? ''),
            'country' => (string) ($orderRow['customer_country'] ?? '')
        ],
        'items' => $items
    ];

    $stockAction = 'none';
    $statusJustConfirmed = ($prevStatus !== 'confirmed' && $nextStatus === 'confirmed');
    $statusJustShipped = ($prevStatus !== 'shipped' && $nextStatus === 'shipped');
    $statusJustDelivered = ($prevStatus !== 'delivered' && $nextStatus === 'delivered');
    try {
        if (!empty($obj['items']) && is_array($obj['items'])) {
            if ($nextStatus === 'confirmed' && !$stockAdjusted) {
                $adjustments = sync_order_stock($conn, $orderId, $obj, false);
                if (!empty($adjustments)) {
                    $obj['stock_adjustments'] = $adjustments;
                }
                $obj['stock_adjusted'] = true;
                $obj['stock_adjusted_at'] = date('Y-m-d H:i:s');
                unset($obj['stock_restored_at']);
                $stockAdjusted = true;
                $stockAction = 'deducted';
            } elseif ($nextStatus === 'cancelled' && $stockAdjusted) {
                $adjustments = sync_order_stock($conn, $orderId, $obj, true);
                if (!empty($adjustments)) {
                    $obj['stock_adjustments'] = $adjustments;
                }
                $obj['stock_adjusted'] = false;
                $obj['stock_restored_at'] = date('Y-m-d H:i:s');
                $stockAdjusted = false;
                $stockAction = 'restored';
            }
        }
    } catch (Throwable $e) {
        error_log('Stock adjustment error: ' . $e->getMessage());
    }

    // If status changed to confirmed or shipped, attempt to send SMS notification
    if ($statusJustConfirmed) {

        // include shared SMS helper
        include_once __DIR__ . '/../../includes/sms_helper.php';
        $phone = null;
        if (isset($obj['customer']) && is_array($obj['customer']) && !empty($obj['customer'])) {
            // new-style JSON saved by save_order.php
            $phone = isset($obj['customer']['phone']) ? $obj['customer']['phone'] : null;
        }
        if (!$phone && isset($obj['phone'])) $phone = $obj['phone'];
        if ($phone && function_exists('normalize_phone_e164') && (function_exists('send_sms_detailed') || function_exists('send_sms'))) {
            try {
                $to = normalize_phone_e164($phone);
                if ($to) {
                    $msg = function_exists('build_order_confirm_sms')
                        ? build_order_confirm_sms($orderId, $obj)
                        : "Good day. Your order ($orderId) has been confirmed and is now being processed.";
                    $smsResult = function_exists('send_sms_detailed')
                        ? send_sms_detailed($to, $msg)
                        : ['ok' => send_sms($to, $msg)];
                    $smsOk = !empty($smsResult['ok']);
                    $deliveryState = strtolower(trim((string)($smsResult['delivery_state'] ?? ($smsOk ? 'accepted' : 'failed'))));
                    $messageId = isset($smsResult['message_id']) ? (string)$smsResult['message_id'] : null;
                    $httpCode = isset($smsResult['http_code']) ? (int)$smsResult['http_code'] : 0;
                    $obj['sms_on_confirm'] = [
                        'attempted_at' => date('Y-m-d H:i:s'),
                        'ok' => $smsOk,
                        'provider' => (string)($smsResult['provider'] ?? 'unknown'),
                        'delivery_state' => $deliveryState !== '' ? $deliveryState : ($smsOk ? 'accepted' : 'failed'),
                        'accepted' => !empty($smsResult['accepted']),
                        'simulated' => !empty($smsResult['simulated']),
                        'http_code' => $httpCode,
                        'message_id' => $messageId,
                        'recipient' => (string)($smsResult['recipient'] ?? $to),
                        'sender_name' => isset($smsResult['sender_name']) ? (string)$smsResult['sender_name'] : null,
                        'reason' => isset($smsResult['reason']) ? (string)$smsResult['reason'] : null
                    ];

                    if ($smsOk) {
                        error_log(
                            'Admin SMS accepted for order ' . $orderId .
                            ' to ' . $to .
                            ' state=' . ($obj['sms_on_confirm']['delivery_state']) .
                            ' http=' . $httpCode .
                            ($messageId ? ' message_id=' . $messageId : ''),
                            3,
                            __DIR__ . '/../../orders/status_debug.log'
                        );
                        $obj['sms_sent_on_confirm'] = date('Y-m-d H:i:s');
                        if ($deliveryState === 'pending') {
                            $obj['sms_pending_on_confirm'] = true;
                        } else {
                            unset($obj['sms_pending_on_confirm']);
                        }
                    } else {
                        error_log(
                            'Admin SMS FAILED for order ' . $orderId .
                            ' to ' . $to .
                            ' http=' . $httpCode .
                            ' reason=' . (string)($smsResult['reason'] ?? 'unknown'),
                            3,
                            __DIR__ . '/../../orders/status_debug.log'
                        );
                        $obj['sms_failed_on_confirm'] = true;
                        unset($obj['sms_pending_on_confirm']);
                    }
                } else {
                    error_log('Admin SMS: phone normalization failed for ' . $phone);
                }
            } catch (Throwable $e) {
                error_log('Admin SMS exception: ' . $e->getMessage());
            }
        } else {
            error_log('Admin SMS not sent: no phone available or SMS helper missing');
        }
    }

    if ($statusJustShipped) {
        include_once __DIR__ . '/../../includes/sms_helper.php';
        $phone = null;
        if (isset($obj['customer']) && is_array($obj['customer']) && !empty($obj['customer'])) {
            $phone = isset($obj['customer']['phone']) ? $obj['customer']['phone'] : null;
        }
        if (!$phone && isset($obj['phone'])) $phone = $obj['phone'];
        if ($phone && function_exists('normalize_phone_e164') && (function_exists('send_sms_detailed') || function_exists('send_sms'))) {
            try {
                $to = normalize_phone_e164($phone);
                if ($to) {
                    $msg = function_exists('build_order_shipped_sms')
                        ? build_order_shipped_sms($orderId, $obj)
                        : "Hi. Your order ($orderId) is now out for delivery. Please keep your phone available for any delivery updates.";
                    $smsResult = function_exists('send_sms_detailed')
                        ? send_sms_detailed($to, $msg)
                        : ['ok' => send_sms($to, $msg)];
                    $smsOk = !empty($smsResult['ok']);
                    $deliveryState = strtolower(trim((string)($smsResult['delivery_state'] ?? ($smsOk ? 'accepted' : 'failed'))));
                    $messageId = isset($smsResult['message_id']) ? (string)$smsResult['message_id'] : null;
                    $httpCode = isset($smsResult['http_code']) ? (int)$smsResult['http_code'] : 0;
                    $obj['sms_on_shipped'] = [
                        'attempted_at' => date('Y-m-d H:i:s'),
                        'ok' => $smsOk,
                        'provider' => (string)($smsResult['provider'] ?? 'unknown'),
                        'delivery_state' => $deliveryState !== '' ? $deliveryState : ($smsOk ? 'accepted' : 'failed'),
                        'accepted' => !empty($smsResult['accepted']),
                        'simulated' => !empty($smsResult['simulated']),
                        'http_code' => $httpCode,
                        'message_id' => $messageId,
                        'recipient' => (string)($smsResult['recipient'] ?? $to),
                        'sender_name' => isset($smsResult['sender_name']) ? (string)$smsResult['sender_name'] : null,
                        'reason' => isset($smsResult['reason']) ? (string)$smsResult['reason'] : null
                    ];

                    if ($smsOk) {
                        error_log(
                            'Admin SMS accepted for shipped order ' . $orderId .
                            ' to ' . $to .
                            ' state=' . ($obj['sms_on_shipped']['delivery_state']) .
                            ' http=' . $httpCode .
                            ($messageId ? ' message_id=' . $messageId : ''),
                            3,
                            __DIR__ . '/../../orders/status_debug.log'
                        );
                        $obj['sms_sent_on_shipped'] = date('Y-m-d H:i:s');
                        if ($deliveryState === 'pending') {
                            $obj['sms_pending_on_shipped'] = true;
                        } else {
                            unset($obj['sms_pending_on_shipped']);
                        }
                    } else {
                        error_log(
                            'Admin SMS FAILED for shipped order ' . $orderId .
                            ' to ' . $to .
                            ' http=' . $httpCode .
                            ' reason=' . (string)($smsResult['reason'] ?? 'unknown'),
                            3,
                            __DIR__ . '/../../orders/status_debug.log'
                        );
                        $obj['sms_failed_on_shipped'] = true;
                        unset($obj['sms_pending_on_shipped']);
                    }
                } else {
                    error_log('Admin SMS shipped: phone normalization failed for ' . $phone);
                }
            } catch (Throwable $e) {
                error_log('Admin SMS shipped exception: ' . $e->getMessage());
            }
        } else {
            error_log('Admin SMS shipped not sent: no phone available or SMS helper missing');
        }
    }

    if ($statusJustDelivered) {
        include_once __DIR__ . '/../../includes/sms_helper.php';
        $phone = null;
        if (isset($obj['customer']) && is_array($obj['customer']) && !empty($obj['customer'])) {
            $phone = isset($obj['customer']['phone']) ? $obj['customer']['phone'] : null;
        }
        if (!$phone && isset($obj['phone'])) $phone = $obj['phone'];
        if ($phone && function_exists('normalize_phone_e164') && (function_exists('send_sms_detailed') || function_exists('send_sms'))) {
            try {
                $to = normalize_phone_e164($phone);
                if ($to) {
                    $msg = function_exists('build_order_delivered_sms')
                        ? build_order_delivered_sms($orderId, $obj)
                        : 'Your order has been successfully delivered. We hope you enjoy your purchase! If you have any questions or concerns, feel free to contact us.';
                    $smsResult = function_exists('send_sms_detailed')
                        ? send_sms_detailed($to, $msg)
                        : ['ok' => send_sms($to, $msg)];
                    $smsOk = !empty($smsResult['ok']);
                    $deliveryState = strtolower(trim((string)($smsResult['delivery_state'] ?? ($smsOk ? 'accepted' : 'failed'))));
                    $messageId = isset($smsResult['message_id']) ? (string)$smsResult['message_id'] : null;
                    $httpCode = isset($smsResult['http_code']) ? (int)$smsResult['http_code'] : 0;
                    $obj['sms_on_delivered'] = [
                        'attempted_at' => date('Y-m-d H:i:s'),
                        'ok' => $smsOk,
                        'provider' => (string)($smsResult['provider'] ?? 'unknown'),
                        'delivery_state' => $deliveryState !== '' ? $deliveryState : ($smsOk ? 'accepted' : 'failed'),
                        'accepted' => !empty($smsResult['accepted']),
                        'simulated' => !empty($smsResult['simulated']),
                        'http_code' => $httpCode,
                        'message_id' => $messageId,
                        'recipient' => (string)($smsResult['recipient'] ?? $to),
                        'sender_name' => isset($smsResult['sender_name']) ? (string)$smsResult['sender_name'] : null,
                        'reason' => isset($smsResult['reason']) ? (string)$smsResult['reason'] : null
                    ];

                    if ($smsOk) {
                        error_log(
                            'Admin SMS accepted for delivered order ' . $orderId .
                            ' to ' . $to .
                            ' state=' . ($obj['sms_on_delivered']['delivery_state']) .
                            ' http=' . $httpCode .
                            ($messageId ? ' message_id=' . $messageId : ''),
                            3,
                            __DIR__ . '/../../orders/status_debug.log'
                        );
                        $obj['sms_sent_on_delivered'] = date('Y-m-d H:i:s');
                        if ($deliveryState === 'pending') {
                            $obj['sms_pending_on_delivered'] = true;
                        } else {
                            unset($obj['sms_pending_on_delivered']);
                        }
                    } else {
                        error_log(
                            'Admin SMS FAILED for delivered order ' . $orderId .
                            ' to ' . $to .
                            ' http=' . $httpCode .
                            ' reason=' . (string)($smsResult['reason'] ?? 'unknown'),
                            3,
                            __DIR__ . '/../../orders/status_debug.log'
                        );
                        $obj['sms_failed_on_delivered'] = true;
                        unset($obj['sms_pending_on_delivered']);
                    }
                } else {
                    error_log('Admin SMS delivered: phone normalization failed for ' . $phone);
                }
            } catch (Throwable $e) {
                error_log('Admin SMS delivered exception: ' . $e->getMessage());
            }
        } else {
            error_log('Admin SMS delivered not sent: no phone available or SMS helper missing');
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Order status updated',
        'orderId' => $orderId,
        'status' => $status,
        'order' => $obj,
        'stock_action' => $stockAction,
        'sms' => isset($obj['sms_on_confirm']) ? $obj['sms_on_confirm'] : (isset($obj['sms_on_shipped']) ? $obj['sms_on_shipped'] : (isset($obj['sms_on_delivered']) ? $obj['sms_on_delivered'] : null))
    ]);
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
    exit;
}
