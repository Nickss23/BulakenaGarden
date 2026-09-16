<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/config.php';

header('Content-Type: application/json; charset=utf-8');

function app_orders_json(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function app_orders_api_key(): string
{
    if (defined('BULAKENA_APP_API_KEY') && trim((string) BULAKENA_APP_API_KEY) !== '') {
        return trim((string) BULAKENA_APP_API_KEY);
    }

    $key = getenv('BULAKENA_APP_API_KEY');
    if (is_string($key) && trim($key) !== '') {
        return trim($key);
    }

    // Change this value before using the app outside your local machine.
    return 'bulakena-vs2022-local-key';
}

function app_orders_request_key(): string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $name => $value) {
        if (strtolower((string)$name) === 'x-bulakena-app-key') {
            return trim((string)$value);
        }
    }

    return trim((string)($_GET['key'] ?? $_POST['key'] ?? ''));
}

function app_orders_table_exists(mysqli $conn, string $table): bool
{
    $safeTable = $conn->real_escape_string($table);
    $result = $conn->query("SHOW TABLES LIKE '{$safeTable}'");
    $exists = $result instanceof mysqli_result && $result->num_rows > 0;
    if ($result instanceof mysqli_result) {
        $result->free();
    }
    return $exists;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    app_orders_json(405, ['success' => false, 'message' => 'Method not allowed. Use GET.']);
}

$expectedKey = app_orders_api_key();
$providedKey = app_orders_request_key();
if ($expectedKey === '' || $providedKey === '' || !hash_equals($expectedKey, $providedKey)) {
    app_orders_json(401, ['success' => false, 'message' => 'Invalid app API key.']);
}

if (!isset($conn) || !($conn instanceof mysqli)) {
    app_orders_json(500, ['success' => false, 'message' => 'Database connection not available.']);
}

try {
    if (!app_orders_table_exists($conn, 'orders')) {
        app_orders_json(200, ['success' => true, 'orders' => []]);
    }

    $statusFilter = strtolower(trim((string)($_GET['status'] ?? '')));
    $limit = max(1, min(500, (int)($_GET['limit'] ?? 100)));

    $where = '';
    $types = '';
    $params = [];
    if ($statusFilter !== '') {
        $where = 'WHERE LOWER(COALESCE(`status`, "")) = ?';
        $types = 's';
        $params[] = $statusFilter;
    }

    $sql = "SELECT * FROM `orders` {$where} ORDER BY created_at DESC, id DESC LIMIT ?";
    $types .= 'i';
    $params[] = $limit;

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        app_orders_json(500, ['success' => false, 'message' => 'Could not prepare orders query.']);
    }

    $bindArgs = [$types];
    for ($i = 0; $i < count($params); $i++) {
        $bindArgs[] = &$params[$i];
    }
    call_user_func_array([$stmt, 'bind_param'], $bindArgs);
    $stmt->execute();

    $orders = [];
    $orderIds = [];
    $result = method_exists($stmt, 'get_result') ? $stmt->get_result() : null;
    if ($result instanceof mysqli_result) {
        while ($row = $result->fetch_assoc()) {
            $id = (int)($row['id'] ?? 0);
            if ($id <= 0) continue;
            $orderIds[] = $id;
            $orderRef = (string)($row['order_ref'] ?? '');
            $status = strtolower(trim((string)($row['status'] ?? 'pending')));
            $createdAt = (string)($row['created_at'] ?? '');
            $statusUpdatedAt = (string)($row['status_updated_at'] ?? '');
            $deliveryType = (string)($row['delivery_type'] ?? '');
            $shippingFee = (float)($row['shipping_fee'] ?? 0);
            $total = (float)($row['total'] ?? 0);
            $paymentMethod = (string)($row['payment_method'] ?? '');
            $customerFirst = (string)($row['customer_first'] ?? '');
            $customerLast = (string)($row['customer_last'] ?? '');
            $streetAddress = (string)($row['customer_street_address'] ?? $row['customer_address'] ?? '');
            $apartment = (string)($row['customer_apartment'] ?? '');
            $barangay = (string)($row['customer_barangay'] ?? '');
            $municipality = (string)($row['customer_municipality'] ?? '');
            $province = (string)($row['customer_province'] ?? '');
            $region = (string)($row['customer_region'] ?? '');
            $postalCode = (string)($row['customer_postal_code'] ?? '');
            $country = (string)($row['customer_country'] ?? '');
            $addressParts = [];
            foreach ([$streetAddress, $apartment, $barangay, $municipality, $province, $region, $postalCode, $country] as $part) {
                $part = trim((string)$part);
                if ($part !== '') {
                    $addressParts[] = $part;
                }
            }

            $orders[$id] = [
                'id' => $id,
                'order_ref' => $orderRef,
                'orderId' => $orderRef,
                'status' => $status,
                'created_at' => $createdAt,
                'createdAt' => $createdAt,
                'date' => $createdAt,
                'status_updated_at' => $statusUpdatedAt,
                'statusUpdatedAt' => $statusUpdatedAt,
                'delivery_type' => $deliveryType,
                'deliveryType' => $deliveryType,
                'shipping_fee' => $shippingFee,
                'shippingFee' => $shippingFee,
                'total' => $total,
                'payment_method' => $paymentMethod,
                'paymentMethod' => $paymentMethod,
                'notes' => (string)($row['notes'] ?? ''),
                'customer' => [
                    'first_name' => $customerFirst,
                    'firstName' => $customerFirst,
                    'last_name' => $customerLast,
                    'lastName' => $customerLast,
                    'email' => (string)($row['customer_email'] ?? ''),
                    'phone' => (string)($row['customer_phone'] ?? ''),
                    'address' => $streetAddress,
                    'street_address' => $streetAddress,
                    'streetAddress' => $streetAddress,
                    'apartment' => $apartment,
                    'barangay' => $barangay,
                    'municipality' => $municipality,
                    'province' => $province,
                    'region' => $region,
                    'postal_code' => $postalCode,
                    'postalCode' => $postalCode,
                    'country' => $country,
                    'fullAddress' => implode(', ', $addressParts),
                ],
                'items' => [],
            ];
        }
        $result->free();
    }
    $stmt->close();

    if ($orderIds && app_orders_table_exists($conn, 'order_items')) {
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        $itemSql = "SELECT order_id, product_id, title, price, qty FROM `order_items` WHERE order_id IN ({$placeholders}) ORDER BY order_id ASC, id ASC";
        $itemStmt = $conn->prepare($itemSql);
        if ($itemStmt) {
            $itemTypes = str_repeat('i', count($orderIds));
            $itemBindArgs = [$itemTypes];
            for ($i = 0; $i < count($orderIds); $i++) {
                $itemBindArgs[] = &$orderIds[$i];
            }
            call_user_func_array([$itemStmt, 'bind_param'], $itemBindArgs);
            $itemStmt->execute();
            $itemResult = method_exists($itemStmt, 'get_result') ? $itemStmt->get_result() : null;
            if ($itemResult instanceof mysqli_result) {
                while ($item = $itemResult->fetch_assoc()) {
                    $orderId = (int)($item['order_id'] ?? 0);
                    if (!isset($orders[$orderId])) continue;
                    $orders[$orderId]['items'][] = [
                        'product_id' => (int)($item['product_id'] ?? 0),
                        'productId' => (int)($item['product_id'] ?? 0),
                        'title' => (string)($item['title'] ?? ''),
                        'price' => (float)($item['price'] ?? 0),
                        'qty' => (int)($item['qty'] ?? 0),
                        'quantity' => (int)($item['qty'] ?? 0),
                    ];
                }
                $itemResult->free();
            }
            $itemStmt->close();
        }
    }

    app_orders_json(200, [
        'success' => true,
        'count' => count($orders),
        'orders' => array_values($orders),
    ]);
} catch (Throwable $e) {
    error_log('app_orders failed: ' . $e->getMessage());
    app_orders_json(500, ['success' => false, 'message' => 'Server error while loading app orders.']);
}
