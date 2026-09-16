<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/paymongo_config.php';
require_once __DIR__ . '/../../includes/order_payment_helpers.php';
if (file_exists(__DIR__ . '/../../includes/config.php')) {
    require_once __DIR__ . '/../../includes/config.php';
}

header('Content-Type: application/json; charset=utf-8');

function paymongo_error(int $statusCode, string $message, array $extra = []): void
{
    http_response_code($statusCode);
    $payload = ['success' => false, 'message' => $message];
    if (!empty($extra)) {
        $payload = array_merge($payload, $extra);
    }
    echo json_encode($payload);
    exit;
}

function paymongo_secret_key(): string
{
    if (defined('PAYMONGO_SECRET_KEY') && is_string(PAYMONGO_SECRET_KEY) && trim(PAYMONGO_SECRET_KEY) !== '') {
        return trim(PAYMONGO_SECRET_KEY);
    }

    $candidates = [
        getenv('PAYMONGO_SECRET_KEY'),
        getenv('PAYMONGO_API_KEY'),
        getenv('PAYMONGO_LIVE_SECRET_KEY'),
        getenv('PAYMONGO_TEST_SECRET_KEY'),
        $_ENV['PAYMONGO_SECRET_KEY'] ?? null,
        $_SERVER['PAYMONGO_SECRET_KEY'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        if (is_string($candidate) && trim($candidate) !== '') {
            return trim($candidate);
        }
    }

    return '';
}

function paymongo_base_url(): string
{
    $scheme = 'http';
    if ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') {
        $scheme = 'https';
    }

    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    paymongo_error(405, 'Method not allowed. Use POST.');
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
    paymongo_error(400, 'Invalid request payload.');
}

$items = is_array($input['items'] ?? null) ? $input['items'] : [];
$total = (float) ($input['total'] ?? 0);
if (empty($items) || $total <= 0) {
    paymongo_error(422, 'Order items and total are required.');
}

$orderRef = trim((string) ($input['order_ref'] ?? ''));
$orderRef = bg_customer_order_ref_or_new($orderRef, (isset($conn) && $conn instanceof mysqli) ? $conn : null);

$customerName = trim((string) ($input['customer_name'] ?? ''));
$customerPhone = trim((string) ($input['customer_phone'] ?? ''));
$customerEmail = trim((string) ($input['customer_email'] ?? ''));
$customerAddress = trim((string) ($input['customer_address'] ?? ''));
$deliveryType = trim((string) ($input['delivery_type'] ?? 'delivery'));

$secretKey = paymongo_secret_key();
if ($secretKey === '') {
    paymongo_error(500, 'PAYMONGO_SECRET_KEY is not configured on the server.');
}

$amountInCentavos = (int) round($total * 100);
$baseUrl = rtrim(paymongo_base_url(), '/');
$successUrl = $baseUrl . '/website/index.html?paymongo=success&order=' . urlencode($orderRef);
$failedUrl = $baseUrl . '/website/index.html?paymongo=failed&order=' . urlencode($orderRef);

$description = 'Bulakena Garden order ' . $orderRef;
if ($customerName !== '') {
    $description .= ' - ' . $customerName;
}

$payload = [
    'data' => [
        'attributes' => [
            'amount' => $amountInCentavos,
            'currency' => 'PHP',
            'type' => 'qrph',
            'description' => $description,
            'redirect' => [
                'success' => $successUrl,
                'failed' => $failedUrl,
            ],
        ],
    ],
];

$ch = curl_init('https://api.paymongo.com/v1/sources');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
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
    paymongo_error(502, 'Failed to contact PayMongo.', ['details' => $curlError ?: 'Unknown cURL error']);
}

$decoded = json_decode((string) $responseBody, true);
if (!is_array($decoded) || $httpStatus >= 400) {
    $details = [
        'http_status' => $httpStatus,
        'paymongo_response' => $decoded,
    ];
    paymongo_error(502, 'PayMongo rejected the payment request.', $details);
}

$checkoutUrl = $decoded['data']['attributes']['redirect']['checkout_url'] ?? null;
if (!is_string($checkoutUrl) || $checkoutUrl === '') {
    paymongo_error(502, 'PayMongo did not return a checkout URL.', ['paymongo_response' => $decoded]);
}

$attributes = is_array($decoded['data']['attributes'] ?? null) ? $decoded['data']['attributes'] : [];

// PayMongo QRPH responses can expose the QR as an image URL or as the raw EMV QR value.
$qrCodeUrl = null;
foreach ([
    $attributes['qr_code']['image_url'] ?? null,
    $attributes['qr_code']['url'] ?? null,
    $attributes['qr_code_url'] ?? null,
    $attributes['qr_image_url'] ?? null,
    $attributes['qr_image'] ?? null,
] as $candidate) {
    if (is_string($candidate) && trim($candidate) !== '') {
        $qrCodeUrl = trim($candidate);
        break;
    }
}

$qrCodeValue = null;
foreach ([
    $attributes['qr_code']['value'] ?? null,
    $attributes['qr_code']['data'] ?? null,
    $attributes['qr_code']['text'] ?? null,
    $attributes['qr_code_value'] ?? null,
    $attributes['qr_string'] ?? null,
    $attributes['qr_payload'] ?? null,
] as $candidate) {
    if (is_string($candidate) && trim($candidate) !== '') {
        $qrCodeValue = trim($candidate);
        break;
    }
}

try {
    if (isset($conn) && $conn instanceof mysqli) {
        $orderRef = $conn->real_escape_string($orderRef);
        $customerName = $conn->real_escape_string($customerName);
        $customerPhone = $conn->real_escape_string($customerPhone);
        $customerEmail = $conn->real_escape_string($customerEmail);
        $customerAddress = $conn->real_escape_string($customerAddress);
        $deliveryType = $conn->real_escape_string($deliveryType);
        $paymentMethod = 'QRPH';

        $fields = [
            '`order_ref`',
            '`customer_first`',
            '`customer_last`',
            '`customer_email`',
            '`customer_phone`',
            '`customer_address`',
            '`delivery_type`',
            '`payment_method`',
            '`total`',
            '`status`',
            '`status_updated_at`',
            '`created_at`',
        ];

        $tableCheck = $conn->query("SHOW TABLES LIKE 'orders'");
        if ($tableCheck instanceof mysqli_result && $tableCheck->num_rows > 0) {
            $orderColumns = [];
            $columnRes = $conn->query('SHOW COLUMNS FROM `orders`');
            if ($columnRes instanceof mysqli_result) {
                while ($col = $columnRes->fetch_assoc()) {
                    $orderColumns[] = strtolower((string) ($col['Field'] ?? ''));
                }
                $columnRes->free();
            }

            $availableCols = [];
            foreach ($fields as $field) {
                $name = trim(strtolower(str_replace(['`', ' '], '', $field)));
                if (in_array($name, $orderColumns, true)) {
                    $availableCols[] = $name;
                }
            }

            if (!empty($availableCols)) {
                $insertColumns = [];
                $insertValues = [];
                $bindTypes = '';
                $bindValues = [];

                foreach ($availableCols as $col) {
                    $insertColumns[] = '`' . $col . '`';
                    $insertValues[] = '?';
                }

                foreach ($availableCols as $col) {
                    switch ($col) {
                        case 'order_ref':
                            $bindValues[] = $orderRef;
                            $bindTypes .= 's';
                            break;
                        case 'customer_first':
                            $bindValues[] = $customerName;
                            $bindTypes .= 's';
                            break;
                        case 'customer_last':
                            $bindValues[] = '';
                            $bindTypes .= 's';
                            break;
                        case 'customer_email':
                            $bindValues[] = $customerEmail;
                            $bindTypes .= 's';
                            break;
                        case 'customer_phone':
                            $bindValues[] = $customerPhone;
                            $bindTypes .= 's';
                            break;
                        case 'customer_address':
                            $bindValues[] = $customerAddress;
                            $bindTypes .= 's';
                            break;
                        case 'delivery_type':
                            $bindValues[] = $deliveryType;
                            $bindTypes .= 's';
                            break;
                        case 'payment_method':
                            $bindValues[] = $paymentMethod;
                            $bindTypes .= 's';
                            break;
                        case 'total':
                            $bindValues[] = (float) $total;
                            $bindTypes .= 'd';
                            break;
                        case 'status':
                            $bindValues[] = 'pending';
                            $bindTypes .= 's';
                            break;
                        case 'status_updated_at':
                            $bindValues[] = date('Y-m-d H:i:s');
                            $bindTypes .= 's';
                            break;
                        case 'created_at':
                            $bindValues[] = date('Y-m-d H:i:s');
                            $bindTypes .= 's';
                            break;
                        default:
                            $bindValues[] = '';
                            $bindTypes .= 's';
                            break;
                    }
                }

                $sql = 'INSERT INTO `orders` (' . implode(', ', $insertColumns) . ') VALUES (' . implode(', ', $insertValues) . ')';
                $stmt = $conn->prepare($sql);
                if ($stmt) {
                    $stmt->bind_param($bindTypes, ...$bindValues);
                    $stmt->execute();
                    $stmt->close();
                }
            }
        }
    }
} catch (Throwable $e) {
    error_log('paymongo_create_source: ' . $e->getMessage());
}

echo json_encode([
    'success' => true,
    'message' => 'QRPH checkout started.',
    'order_ref' => $orderRef,
    'checkout_url' => $checkoutUrl,
    'qr_code_url' => $qrCodeUrl,
    'qr_code_value' => $qrCodeValue,
    'source_id' => $decoded['data']['id'] ?? null,
]);
