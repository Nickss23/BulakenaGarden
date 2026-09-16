<?php
header('Content-Type: application/json; charset=utf-8');

if (file_exists(__DIR__ . '/../../includes/config.php')) {
    require_once __DIR__ . '/../../includes/config.php';
}

function jsonResp(bool $success, array $data = []): never
{
    echo json_encode(array_merge(['success' => $success], $data));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResp(false, ['message' => 'Invalid request method. Use POST.']);
}

$orderIdentifier = $_POST['orderId']
    ?? $_POST['order_id']
    ?? $_POST['orderRef']
    ?? $_POST['id']
    ?? null;

if ($orderIdentifier === null || trim((string) $orderIdentifier) === '') {
    jsonResp(false, ['message' => 'Missing orderId']);
}

if (!isset($_FILES['proof_delivery_image'])) {
    jsonResp(false, ['message' => 'Missing proof_delivery_image file']);
}

$file = $_FILES['proof_delivery_image'];
if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
    jsonResp(false, ['message' => 'File upload error', 'error' => $file['error'] ?? 'unknown']);
}

if ((int) ($file['size'] ?? 0) > 10 * 1024 * 1024) {
    jsonResp(false, ['message' => 'File too large. Max 10MB.']);
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
if ($finfo === false) {
    jsonResp(false, ['message' => 'Unable to validate uploaded file type.']);
}

$mime = finfo_file($finfo, (string) ($file['tmp_name'] ?? ''));
finfo_close($finfo);

$allowed = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];

if (!isset($allowed[$mime])) {
    jsonResp(false, ['message' => 'Invalid image type: ' . $mime]);
}

$uploadDir = __DIR__ . '/../../uploads/proof_delivery/';
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
    jsonResp(false, ['message' => 'Unable to create upload directory']);
}

if (!is_writable($uploadDir)) {
    jsonResp(false, ['message' => 'Upload directory is not writable']);
}

$safeIdent = preg_replace('/[^A-Za-z0-9_\-]/', '_', (string) $orderIdentifier);
$safeIdent = trim((string) $safeIdent, '_-');
if ($safeIdent === '') {
    $safeIdent = 'order';
}

$timestamp = date('Ymd_His');
$rand = bin2hex(random_bytes(4));
$ext = $allowed[$mime];
$filename = sprintf('pod_%s_%s_%s.%s', $safeIdent, $timestamp, $rand, $ext);
$destPath = $uploadDir . $filename;
$relativePath = 'uploads/proof_delivery/' . $filename;
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$publicUrl = 'http://' . $host . '/BulakenaGarden/' . $relativePath;

if (!move_uploaded_file((string) ($file['tmp_name'] ?? ''), $destPath)) {
    jsonResp(false, ['message' => 'Unable to save uploaded file']);
}

try {
    if (!isset($conn) || !($conn instanceof mysqli)) {
        @unlink($destPath);
        jsonResp(false, ['message' => 'Database connection not configured']);
    }

    $columnCheck = $conn->query("SHOW COLUMNS FROM `orders` LIKE 'proof_delivery_image'");
    if ($columnCheck instanceof mysqli_result && $columnCheck->num_rows === 0) {
        $conn->query("ALTER TABLE `orders` ADD COLUMN `proof_delivery_image` VARCHAR(255) DEFAULT NULL");
    }
    if ($columnCheck instanceof mysqli_result) {
        $columnCheck->free();
    }

    $orderId = null;
    $stmt = $conn->prepare('SELECT id FROM orders WHERE order_ref = ? LIMIT 1');
    if ($stmt) {
        $stmt->bind_param('s', $orderIdentifier);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result ? $result->fetch_assoc() : null;
        $stmt->close();
        if (is_array($row) && !empty($row['id'])) {
            $orderId = (int) $row['id'];
        }
    }

    if ($orderId === null && ctype_digit((string) $orderIdentifier)) {
        $orderId = (int) $orderIdentifier;
    }

    if ($orderId === null) {
        @unlink($destPath);
        jsonResp(false, ['message' => 'Order not found']);
    }

    $statusStmt = $conn->prepare('UPDATE orders SET proof_delivery_image = ?, status = ?, status_updated_at = NOW() WHERE id = ?');
    if (!$statusStmt) {
        @unlink($destPath);
        jsonResp(false, ['message' => 'Could not prepare order update']);
    }

    $status = 'delivered';
    $statusStmt->bind_param('ssi', $relativePath, $status, $orderId);
    $statusStmt->execute();
    $statusStmt->close();

    jsonResp(true, [
        'message' => 'Proof saved successfully',
        'orderId' => (string) $orderIdentifier,
        'proof_delivery_image' => $relativePath,
        'public_url' => $publicUrl,
        'status' => $status,
    ]);
} catch (Throwable $e) {
    @unlink($destPath);
    jsonResp(false, ['message' => 'Database error: ' . $e->getMessage()]);
}
