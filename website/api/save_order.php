<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json');

require_once __DIR__ . '/../../includes/order_payment_helpers.php';
if (file_exists(__DIR__ . '/../../includes/config.php')) {
    include_once __DIR__ . '/../../includes/config.php';
}

// Get the JSON data
$data = json_decode(file_get_contents('php://input'), true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid request']);
    exit;
}

// Validate required fields. Last name is optional so customers with a single
// account name can still place an order.
$required = ['phone', 'firstName', 'address', 'city', 'items'];
foreach ($required as $field) {
    if (empty($data[$field])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Missing required field: $field"]);
        exit;
    }
}

$email = isset($data['email']) ? trim((string)$data['email']) : '';
$data['lastName'] = isset($data['lastName']) ? trim((string)$data['lastName']) : '';
$phoneDigits = preg_replace('/\D+/', '', (string)($data['phone'] ?? ''));
if (strlen($phoneDigits) === 12 && strpos($phoneDigits, '63') === 0) {
    $phoneDigits = '0' . substr($phoneDigits, 2);
} elseif (strlen($phoneDigits) === 10 && $phoneDigits[0] === '9') {
    $phoneDigits = '0' . $phoneDigits;
}
$data['phone'] = $phoneDigits;

// Validate phone digits-only and exact length
if (empty($data['phone']) || !preg_match('/^\d{11}$/', $data['phone'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid phone number - exactly 11 digits required']);
    exit;
}

try {
    // You can add database insertion here
    // For now, we'll just log the order and send email
    
    $incomingOrderRef = trim((string)($data['order_ref'] ?? $data['orderId'] ?? ''));
    $orderId = bg_customer_order_ref_or_new($incomingOrderRef, (isset($conn) && $conn instanceof mysqli) ? $conn : null);
    
    // Prepare order details for email
    $orderDetails = "Order ID: $orderId\n";
    $orderDetails .= "Date: " . date('Y-m-d H:i:s') . "\n\n";
    $orderDetails .= "Customer Information:\n";
    $orderDetails .= "Name: " . $data['firstName'] . " " . $data['lastName'] . "\n";
    if ($email !== '') {
        $orderDetails .= "Email: " . $email . "\n";
    }
    $orderDetails .= "Phone: " . $data['phone'] . "\n";
    $orderDetails .= "Address: " . $data['address'] . "\n";
    if (!empty($data['apartment'])) {
        $orderDetails .= "Apartment/Suite: " . $data['apartment'] . "\n";
    }
    $orderDetails .= "City: " . $data['city'] . "\n";
    $orderDetails .= "Region: " . $data['region'] . "\n";
    $orderDetails .= "Country: " . $data['country'] . "\n";
    $orderDetails .= "Postal Code: " . $data['postalCode'] . "\n";
    $orderDetails .= "Delivery Type: " . ucfirst($data['deliveryType']) . "\n\n";
    
    $orderDetails .= "Items:\n";
    $totalAmount = 0;
    foreach ($data['items'] as $item) {
        $itemTotal = $item['price'] * $item['qty'];
        $totalAmount += $itemTotal;
        $orderDetails .= "- " . $item['title'] . " x" . $item['qty'] . " @ ₱" . number_format($item['price'], 2) . " = ₱" . number_format($itemTotal, 2) . "\n";
    }
    
    $shippingFee = isset($data['shippingFee']) ? $data['shippingFee'] : 0;
    $orderDetails .= "\nSubtotal: ₱" . number_format($totalAmount, 2) . "\n";
    
    if ($data['deliveryType'] === 'pickup') {
        $orderDetails .= "Shipping: pick up in store FREE\n";
    } else {
        $orderDetails .= "Shipping: ₱" . number_format($shippingFee, 2) . "\n";
    }
    
    $totalAmount += $shippingFee;
    $orderDetails .= "Total Amount: ₱" . number_format($totalAmount, 2) . "\n";
    $orderDetails .= "Payment Method: GCash\n";
    $orderDetails .= "\nNote: Customer will receive GCash payment instruction separately.\n";
    
    // Save order only to MySQL; the database is now the single source of truth.
    try {
        if (!isset($conn) || !($conn instanceof mysqli)) {
            error_log('save_order: $conn not available or not mysqli');
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Database not configured on server.',
                'orderId' => $orderId,
                'db' => false
            ]);
            exit;
        }

        // Ensure connection is alive
        if ($conn->connect_error) {
            error_log('save_order: DB connect error: ' . $conn->connect_error);
            echo json_encode(['success' => false, 'message' => 'Database connection error', 'db_error' => $conn->connect_error]);
            exit;
        }

        $cleanText = function ($value) {
            return trim((string) $value);
        };

        $streetAddress = $cleanText($data['address'] ?? '');
        $apartment = $cleanText($data['apartment'] ?? '');
        $barangay = $cleanText($data['barangay'] ?? '');
        $municipality = $cleanText($data['municipality'] ?? '');
        $province = $cleanText($data['province'] ?? '');
        $region = $cleanText($data['region'] ?? '');
        $postalCode = $cleanText($data['postalCode'] ?? '');
        $country = $cleanText($data['country'] ?? '');

        $fullAddressParts = [];
        foreach ([$streetAddress, $apartment, $barangay, $municipality, $province, $region, $postalCode, $country] as $part) {
            $part = trim((string) $part);
            if ($part !== '') {
                $fullAddressParts[] = $part;
            }
        }
        $fullAddress = implode(', ', $fullAddressParts);

        // Bring the live schema up to the minimum shape this app expects.
        try {
            $ordersCols = [];
            $ordersRes = $conn->query("SHOW COLUMNS FROM `orders`");
            if ($ordersRes) {
                while ($row = $ordersRes->fetch_assoc()) {
                    $ordersCols[] = $row['Field'];
                }
                $ordersRes->free();
            }

            $neededOrderColumns = [];
            if (!in_array('status', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'pending'";
            }
            if (!in_array('status_updated_at', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `status_updated_at` TIMESTAMP NULL DEFAULT NULL";
            }
            if (!in_array('customer_phone', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_phone` VARCHAR(32) DEFAULT NULL";
            }
            if (!in_array('customer_street_address', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_street_address` VARCHAR(255) DEFAULT NULL";
            }
            if (!in_array('customer_apartment', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_apartment` VARCHAR(255) DEFAULT NULL";
            }
            if (!in_array('customer_barangay', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_barangay` VARCHAR(255) DEFAULT NULL";
            }
            if (!in_array('customer_municipality', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_municipality` VARCHAR(255) DEFAULT NULL";
            }
            if (!in_array('customer_province', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_province` VARCHAR(255) DEFAULT NULL";
            }
            if (!in_array('customer_region', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_region` VARCHAR(255) DEFAULT NULL";
            }
            if (!in_array('customer_postal_code', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_postal_code` VARCHAR(32) DEFAULT NULL";
            }
            if (!in_array('customer_country', $ordersCols, true)) {
                $neededOrderColumns[] = "ADD COLUMN `customer_country` VARCHAR(128) DEFAULT NULL";
            }
            if (!empty($neededOrderColumns)) {
                $conn->query("ALTER TABLE `orders` " . implode(', ', $neededOrderColumns));
            }

            $tableCheck = $conn->query("SHOW TABLES LIKE 'order_items'");
            if (!($tableCheck instanceof mysqli_result) || $tableCheck->num_rows <= 0) {
                $conn->query(
                    "CREATE TABLE `order_items` (
                        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                        `order_id` INT UNSIGNED NOT NULL,
                        `product_id` INT NOT NULL DEFAULT 0,
                        `title` VARCHAR(255) NOT NULL,
                        `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        `qty` INT NOT NULL DEFAULT 1,
                        PRIMARY KEY (`id`),
                        KEY `idx_order_id` (`order_id`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
                );
            }
            if ($tableCheck instanceof mysqli_result) {
                $tableCheck->free();
            }
        } catch (Throwable $schemaError) {
            error_log('save_order schema sync failed: ' . $schemaError->getMessage());
        }

        // Prepare address blobs for display and legacy compatibility
        $custAddress = $fullAddress !== '' ? $fullAddress : $streetAddress;
        if ($custAddress === '' && $apartment !== '') {
            $custAddress = $apartment;
        }

        $deliveryType = isset($data['deliveryType']) ? $data['deliveryType'] : 'ship';
        $paymentMethod = 'GCash';
        $notes = isset($data['notes']) ? $data['notes'] : '';
        $shippingFeeDb = floatval($shippingFee);
        $totalDb = floatval($totalAmount);

        $orderColumns = [];
        $columnRows = $conn->query("SHOW COLUMNS FROM `orders`");
        if (!$columnRows) {
            $err = $conn->error;
            error_log('save_order show columns orders failed: ' . $err);
            echo json_encode(['success' => false, 'message' => 'Could not inspect orders table', 'db_error' => $err]);
            exit;
        }
        while ($col = $columnRows->fetch_assoc()) {
            $orderColumns[] = $col['Field'];
        }
        $columnRows->free();

        $orderInsertCols = [];
        $orderInsertVals = [];
        $orderInsertTypes = '';
        $orderInsertParams = [];

        $orderFieldMap = [
            'order_ref' => ['type' => 's', 'value' => $orderId],
            'customer_first' => ['type' => 's', 'value' => $data['firstName']],
            'customer_last' => ['type' => 's', 'value' => $data['lastName']],
            'customer_email' => ['type' => 's', 'value' => $email],
            'customer_phone' => ['type' => 's', 'value' => $data['phone']],
            'customer_address' => ['type' => 's', 'value' => $custAddress],
            'customer_street_address' => ['type' => 's', 'value' => $streetAddress],
            'customer_apartment' => ['type' => 's', 'value' => $apartment],
            'customer_barangay' => ['type' => 's', 'value' => $barangay],
            'customer_municipality' => ['type' => 's', 'value' => $municipality],
            'customer_province' => ['type' => 's', 'value' => $province],
            'customer_region' => ['type' => 's', 'value' => $region],
            'customer_postal_code' => ['type' => 's', 'value' => $postalCode],
            'customer_country' => ['type' => 's', 'value' => $country],
            'delivery_type' => ['type' => 's', 'value' => $deliveryType],
            'shipping_fee' => ['type' => 'd', 'value' => $shippingFeeDb],
            'total' => ['type' => 'd', 'value' => $totalDb],
            'payment_method' => ['type' => 's', 'value' => $paymentMethod],
            'notes' => ['type' => 's', 'value' => $notes],
            'status' => ['type' => 's', 'value' => 'pending'],
            'status_updated_at' => ['type' => 's', 'value' => date('Y-m-d H:i:s')]
        ];

        foreach ($orderFieldMap as $col => $info) {
            if (!in_array($col, $orderColumns, true)) {
                continue;
            }
            $orderInsertCols[] = '`' . $col . '`';
            $orderInsertVals[] = '?';
            $orderInsertTypes .= $info['type'];
            $orderInsertParams[] = $info['value'];
        }

        if (in_array('created_at', $orderColumns, true)) {
            $orderInsertCols[] = '`created_at`';
            $orderInsertVals[] = 'NOW()';
        }

        if (!$orderInsertCols) {
            echo json_encode(['success' => false, 'message' => 'Orders table has no usable columns']);
            exit;
        }

        $sql = 'INSERT INTO `orders` (' . implode(', ', $orderInsertCols) . ') VALUES (' . implode(', ', $orderInsertVals) . ')';
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            $err = $conn->error;
            error_log('save_order prepare orders stmt failed: ' . $err);
            echo json_encode(['success' => false, 'message' => 'DB prepare failed', 'db_error' => $err, 'sql' => $sql]);
            exit;
        }

        if (!empty($orderInsertParams)) {
            $bindArgs = [];
            $bindArgs[] = $orderInsertTypes;
            for ($i = 0; $i < count($orderInsertParams); $i++) {
                $bindArgs[] = &$orderInsertParams[$i];
            }
            call_user_func_array([$stmt, 'bind_param'], $bindArgs);
        }

        if (!$stmt->execute()) {
            $err = $stmt->error ?: $conn->error;
            error_log('save_order execute orders stmt failed: ' . $err);
            echo json_encode(['success' => false, 'message' => 'DB insert failed', 'db_error' => $err, 'sql' => $sql]);
            exit;
        }

        $dbOrderId = $conn->insert_id;

        // Insert order_items using available columns only
        if (!empty($data['items']) && is_array($data['items'])) {
            $itemColumns = [];
            $itemRows = $conn->query("SHOW COLUMNS FROM `order_items`");
            if ($itemRows) {
                $availableItemCols = [];
                while ($col = $itemRows->fetch_assoc()) {
                    $availableItemCols[] = $col['Field'];
                }
                $itemRows->free();

                $itemFieldMap = [
                    'order_id' => ['type' => 'i', 'value' => $dbOrderId],
                    'product_id' => ['type' => 'i', 'value' => 0],
                    'title' => ['type' => 's', 'value' => ''],
                    'price' => ['type' => 'd', 'value' => 0],
                    'qty' => ['type' => 'i', 'value' => 1]
                ];

                foreach ($itemFieldMap as $col => $info) {
                    if (in_array($col, $availableItemCols, true)) {
                        $itemColumns[] = $col;
                    }
                }

                if ($itemColumns) {
                    $placeholders = array_fill(0, count($itemColumns), '?');
                    $itemSql = 'INSERT INTO `order_items` (`' . implode('`, `', $itemColumns) . '`) VALUES (' . implode(', ', $placeholders) . ')';
                    $itemStmt = $conn->prepare($itemSql);
                    if (!$itemStmt) {
                        error_log('save_order prepare items stmt failed: ' . $conn->error);
                    } else {
                        foreach ($data['items'] as $it) {
                            $values = [];
                            $types = '';
                            foreach ($itemColumns as $col) {
                                if ($col === 'order_id') {
                                    $values[] = $dbOrderId;
                                    $types .= 'i';
                                } elseif ($col === 'product_id') {
                                    $values[] = isset($it['id']) ? intval($it['id']) : 0;
                                    $types .= 'i';
                                } elseif ($col === 'title') {
                                    $values[] = isset($it['title']) ? (string)$it['title'] : '';
                                    $types .= 's';
                                } elseif ($col === 'price') {
                                    $values[] = floatval(isset($it['price']) ? $it['price'] : 0);
                                    $types .= 'd';
                                } elseif ($col === 'qty') {
                                    $values[] = intval(isset($it['qty']) ? $it['qty'] : 1);
                                    $types .= 'i';
                                }
                            }

                            $bindArgs = [];
                            $bindArgs[] = $types;
                            for ($i = 0; $i < count($values); $i++) {
                                $bindArgs[] = &$values[$i];
                            }
                            call_user_func_array([$itemStmt, 'bind_param'], $bindArgs);
                            if (!$itemStmt->execute()) {
                                error_log('save_order insert item failed: ' . $itemStmt->error);
                            }
                        }
                        $itemStmt->close();
                    }
                }
            }
        }

        $stmt->close();
        // Optionally update phone if the orders table has a customer_phone column
        try {
            $colCheck = $conn->query("SHOW COLUMNS FROM `orders` LIKE 'customer_phone'");
            if ($colCheck && $colCheck->num_rows) {
                $phoneEsc = $conn->real_escape_string($data['phone']);
                $conn->query("UPDATE `orders` SET customer_phone = '$phoneEsc' WHERE id = " . intval($dbOrderId));
            }
        } catch (Exception $e) {
            error_log('Could not update customer_phone column: ' . $e->getMessage());
        }
    } catch (Throwable $e) {
        error_log('DB save_order exception: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Error saving order to database',
            'error' => $e->getMessage()
        ]);
        exit;
    }

    if ($email !== '') {
        // In production, send actual email
        $to = $email;
        $subject = "Order Confirmation - Bulakena Garden";
        $message = "Dear " . $data['firstName'] . ",\n\n";
        $message .= "Thank you for your order!\n\n";
        $message .= $orderDetails . "\n";
        $message .= "We will send you GCash payment instructions shortly.\n\n";
        $message .= "Best regards,\nBulakena Garden Team";

        $headers = "From: orders@bulakemagarden.com\r\n";
        $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

        // mail($to, $subject, $message, $headers);
    }
    
    // Log order received
    error_log("Order received: $orderId from " . ($email !== '' ? $email : 'no-email'));
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Order placed successfully',
        'orderId' => $orderId,
        'total' => $totalAmount
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    error_log("Order error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Error processing order: ' . $e->getMessage()
    ]);
}
?>
