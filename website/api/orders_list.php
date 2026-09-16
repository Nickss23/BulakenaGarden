<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

header('Content-Type: application/json');

// Simple orders listing by email
$email = isset($_GET['email']) ? trim($_GET['email']) : '';

if ($email === '') {
    auth_require_admin_json();
} else {
    auth_start_session();
    $sessionUser = $_SESSION['user'] ?? null;
    $sessionEmail = is_array($sessionUser) ? strtolower(trim((string) ($sessionUser['email'] ?? ''))) : '';
    $requestedEmail = strtolower(trim($email));
    $isAdmin = is_array($sessionUser) && !empty($sessionUser['is_admin']);
    if (!$isAdmin && ($sessionEmail === '' || $sessionEmail !== $requestedEmail)) {
        auth_respond_json(403, ['success' => false, 'message' => 'You may only view your own orders.']);
    }
}

try {
    if (file_exists(__DIR__ . '/../../includes/config.php')) {
        require_once __DIR__ . '/../../includes/config.php';
    }
    if (isset($conn) && ($conn instanceof mysqli)) {
        $tableCheck = $conn->query("SHOW TABLES LIKE 'orders'");
        if ($tableCheck instanceof mysqli_result && $tableCheck->num_rows > 0) {
            $orders = [];
            $itemsByOrderId = [];
            $ordersColumns = [];
            $colResult = $conn->query("SHOW COLUMNS FROM `orders`");
            if ($colResult instanceof mysqli_result) {
                while ($col = $colResult->fetch_assoc()) {
                    $ordersColumns[] = (string) ($col['Field'] ?? '');
                }
                $colResult->free();
            }
            $orderSelect = "SELECT * FROM `orders` ORDER BY created_at DESC, id DESC";
            $orderResult = $conn->query($orderSelect);
            if ($orderResult instanceof mysqli_result) {
                while ($row = $orderResult->fetch_assoc()) {
                    $oid = (int) ($row['id'] ?? 0);
                    $orders[$oid] = $row;
                }
                $orderResult->free();
            }

            $itemResult = $conn->query("SELECT oi.order_id, oi.product_id, oi.title, oi.price, oi.qty, p.img AS product_img FROM `order_items` oi LEFT JOIN `products` p ON p.id = oi.product_id ORDER BY oi.order_id ASC, oi.id ASC");
            if ($itemResult instanceof mysqli_result) {
                while ($item = $itemResult->fetch_assoc()) {
                    $oid = (int) ($item['order_id'] ?? 0);
                    if ($oid <= 0) continue;
                    if (!isset($itemsByOrderId[$oid])) $itemsByOrderId[$oid] = [];
                    $itemsByOrderId[$oid][] = [
                        'id' => (int) ($item['product_id'] ?? 0),
                        'title' => (string) ($item['title'] ?? ''),
                        'price' => (float) ($item['price'] ?? 0),
                        'qty' => (int) ($item['qty'] ?? 0),
                        'img' => (string) ($item['product_img'] ?? '')
                    ];
                }
                $itemResult->free();
            }

            $reviewCountsByOrder = [];
            $reviewsTable = $conn->query("SHOW TABLES LIKE 'reviews'");
            $hasReviewsTable = $reviewsTable instanceof mysqli_result && $reviewsTable->num_rows > 0;
            if ($reviewsTable instanceof mysqli_result) $reviewsTable->free();
            if ($hasReviewsTable) {
                $reviewCols = [];
                $reviewColResult = $conn->query("SHOW COLUMNS FROM `reviews`");
                if ($reviewColResult instanceof mysqli_result) {
                    while ($col = $reviewColResult->fetch_assoc()) {
                        $reviewCols[] = (string)($col['Field'] ?? '');
                    }
                    $reviewColResult->free();
                }
                if (in_array('order_ref', $reviewCols, true)) {
                    $reviewResult = $conn->query("SELECT `order_ref`, COUNT(*) AS review_count FROM `reviews` WHERE `order_ref` IS NOT NULL AND `order_ref` <> '' GROUP BY `order_ref`");
                    if ($reviewResult instanceof mysqli_result) {
                        while ($review = $reviewResult->fetch_assoc()) {
                            $reviewCountsByOrder[strtolower(trim((string)($review['order_ref'] ?? '')))] = (int)($review['review_count'] ?? 0);
                        }
                        $reviewResult->free();
                    }
                }
            }

            $result = [];
            foreach ($orders as $oid => $row) {
                $customerEmail = strtolower(trim((string) ($row['customer_email'] ?? '')));
                if ($email !== '' && $customerEmail !== strtolower(trim($email))) {
                    continue;
                }
                $status = strtolower(trim((string) ($row['status'] ?? 'pending')));
                if ($status === '') $status = 'pending';
                $dateRaw = (string) ($row['created_at'] ?? '');
                $ts = strtotime($dateRaw);
                $dateIso = $ts !== false ? date(DATE_ATOM, $ts) : date(DATE_ATOM);
                $dateKey = $ts !== false ? date('Y-m-d', $ts) : date('Y-m-d');
                $customerFirst = (string) ($row['customer_first'] ?? '');
                $customerLast = (string) ($row['customer_last'] ?? '');
                $streetAddress = (string) ($row['customer_street_address'] ?? $row['customer_address'] ?? '');
                $apartment = (string) ($row['customer_apartment'] ?? '');
                $barangay = (string) ($row['customer_barangay'] ?? '');
                $municipality = (string) ($row['customer_municipality'] ?? '');
                $province = (string) ($row['customer_province'] ?? '');
                $region = (string) ($row['customer_region'] ?? '');
                $postalCode = (string) ($row['customer_postal_code'] ?? '');
                $country = (string) ($row['customer_country'] ?? '');
                $proofDeliveryImage = (string) ($row['proof_delivery_image'] ?? '');
                $addressParts = [];
                foreach ([$streetAddress, $apartment, $barangay, $municipality, $province, $region, $postalCode, $country] as $part) {
                    $part = trim((string) $part);
                    if ($part !== '') {
                        $addressParts[] = $part;
                    }
                }
                $result[] = [
                    'id' => (int) $oid,
                    'orderId' => (string) ($row['order_ref'] ?? $oid),
                    'order_ref' => (string) ($row['order_ref'] ?? $oid),
                    'review_count' => (int) ($reviewCountsByOrder[strtolower(trim((string)($row['order_ref'] ?? $oid)))] ?? 0),
                    'has_review' => (($reviewCountsByOrder[strtolower(trim((string)($row['order_ref'] ?? $oid)))] ?? 0) > 0),
                    'date' => $dateIso,
                    'date_key' => $dateKey,
                    'dateKey' => $dateKey,
                    'status' => $status,
                    'status_updated_at' => (string) ($row['status_updated_at'] ?? ''),
                    'proof_delivery_image' => $proofDeliveryImage,
                    'proofDeliveryImage' => $proofDeliveryImage,
                    'deliveryType' => (string) ($row['delivery_type'] ?? 'ship'),
                    'shippingFee' => (float) ($row['shipping_fee'] ?? 0),
                    'total' => (float) ($row['total'] ?? 0),
                    'paymentMethod' => (string) ($row['payment_method'] ?? ''),
                    'notes' => (string) ($row['notes'] ?? ''),
                    'customer' => [
                        'firstName' => $customerFirst,
                        'lastName' => $customerLast,
                        'email' => (string) ($row['customer_email'] ?? ''),
                        'phone' => (string) ($row['customer_phone'] ?? ''),
                        'address' => $streetAddress,
                        'street_address' => $streetAddress,
                        'apartment' => $apartment,
                        'barangay' => $barangay,
                        'municipality' => $municipality,
                        'province' => $province,
                        'region' => $region,
                        'postalCode' => $postalCode,
                        'country' => $country,
                        'fullAddress' => implode(', ', $addressParts)
                    ],
                    'items' => $itemsByOrderId[$oid] ?? []
                ];
            }

            echo json_encode($result);
            exit;
        }
        if ($tableCheck instanceof mysqli_result) {
            $tableCheck->free();
        }
    }
} catch (Throwable $e) {
    error_log('orders_list DB branch failed: ' . $e->getMessage());
}

echo json_encode([]);
