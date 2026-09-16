<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/paymongo_config.php';
require_once __DIR__ . '/../../includes/order_payment_helpers.php';
if (file_exists(__DIR__ . '/../../includes/config.php')) {
    require_once __DIR__ . '/../../includes/config.php';
}

header('Content-Type: application/json; charset=utf-8');

function checkout_error(int $statusCode, string $message, array $extra = []): void
{
    http_response_code($statusCode);
    $payload = ['success' => false, 'message' => $message];
    if (!empty($extra)) {
        $payload = array_merge($payload, $extra);
    }
    echo json_encode($payload);
    exit;
}

function get_secret_key(): string
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

function get_base_url(): string
{
    $scheme = 'http';
    if ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') {
        $scheme = 'https';
    }

    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host;
}

// Only POST allowed
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    checkout_error(405, 'Method not allowed. Use POST.');
}

// Parse JSON input
$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
    checkout_error(400, 'Invalid JSON payload.');
}

// Validate required fields
$items = is_array($input['items'] ?? null) ? $input['items'] : [];
$total = (float) ($input['total'] ?? 0);
if (empty($items) || $total <= 0) {
    checkout_error(422, 'Order items and total amount are required.');
}

// Extract customer information
$orderRef = trim((string) ($input['order_ref'] ?? ''));
$orderRef = bg_customer_order_ref_or_new($orderRef, (isset($conn) && $conn instanceof mysqli) ? $conn : null);

$customerName = trim((string) ($input['customer_name'] ?? ''));
$customerEmail = trim((string) ($input['customer_email'] ?? ''));

// Get secret key
$secretKey = get_secret_key();
if ($secretKey === '') {
    checkout_error(500, 'PAYMONGO_SECRET_KEY is not configured on the server.');
}

// Use one summary line so PayMongo does not show plant details or a shipping fee line.
$lineItems = [[
    'amount' => (int) round($total * 100),
    'currency' => 'PHP',
    'description' => 'Payment Summary',
    'quantity' => 1,
    'name' => 'Bulakena Garden'
]];

// Build redirect URLs
$baseUrl = rtrim(get_base_url(), '/');
$successUrl = $baseUrl . '/website/index.html?paymongo=success&order=' . urlencode($orderRef);
$cancelUrl = $baseUrl . '/website/index.html?paymongo=cancelled&order=' . urlencode($orderRef);

// Build checkout session payload for PayMongo
$payload = [
    'data' => [
        'attributes' => [
            'line_items' => $lineItems,
            'payment_method_types' => ['qrph'],
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'description' => 'Bulakena Garden order ' . $orderRef,
            'metadata' => [
                'order_ref' => $orderRef,
                'customer_name' => $customerName,
                'customer_email' => $customerEmail
            ]
        ]
    ]
];

// Create checkout session via PayMongo API
$ch = curl_init('https://api.paymongo.com/v1/checkout_sessions');
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

// Handle cURL errors
if ($responseBody === false || $curlError !== '') {
    checkout_error(502, 'Failed to contact PayMongo API.', [
        'details' => $curlError ?: 'Unknown cURL error'
    ]);
}

// Decode PayMongo response
$decoded = json_decode((string) $responseBody, true);
if (!is_array($decoded)) {
    checkout_error(502, 'Invalid response from PayMongo.', [
        'http_status' => $httpStatus,
        'raw_response' => substr((string) $responseBody, 0, 200)
    ]);
}

// Check for API errors
if ($httpStatus >= 400) {
    // Log full error to file for debugging
    $logDir = __DIR__ . '/../../logs';
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    $errorLog = $logDir . '/paymongo_errors.log';
    $errorData = [
        'timestamp' => date('Y-m-d H:i:s'),
        'http_status' => $httpStatus,
        'payload_sent' => $payload,
        'paymongo_response' => $decoded
    ];
    file_put_contents($errorLog, json_encode($errorData) . "\n", FILE_APPEND);

    $errorMsg = 'PayMongo rejected the request.';
    if (isset($decoded['errors']) && is_array($decoded['errors'])) {
        $errors = $decoded['errors'];
        if (!empty($errors[0]['detail'])) {
            $errorMsg = $errors[0]['detail'];
        }
    }
    checkout_error($httpStatus, $errorMsg, [
        'http_status' => $httpStatus,
        'paymongo_response' => $decoded
    ]);
}

// Extract checkout URL from response
$checkoutUrl = $decoded['data']['attributes']['checkout_url'] ?? null;
if (!is_string($checkoutUrl) || $checkoutUrl === '') {
    checkout_error(502, 'PayMongo did not return a checkout URL.', [
        'paymongo_response' => $decoded
    ]);
}

// Extract QR code URL from response if available
$qrCodeUrl = $decoded['data']['attributes']['qr_code']['image_url'] ?? null;
$sessionId = is_string($decoded['data']['id'] ?? null) ? (string)$decoded['data']['id'] : '';

if (!bg_store_pending_checkout($input, $orderRef, $sessionId)) {
    checkout_error(500, 'Could not prepare order for payment confirmation.');
}

// Success: return checkout URL
http_response_code(200);
echo json_encode([
    'success' => true,
    'checkout_url' => $checkoutUrl,
    'order_ref' => $orderRef,
    'session_id' => $sessionId !== '' ? $sessionId : null,
    'qr_code_url' => $qrCodeUrl
]);
