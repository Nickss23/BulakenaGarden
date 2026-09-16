<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
auth_require_admin_json();

header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../../includes/config.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit;
    }

    $id = isset($_POST['id']) && $_POST['id'] !== '' ? (int) $_POST['id'] : 0;
    if ($id <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Invalid product id.']);
        exit;
    }

    $sql = "DELETE FROM products WHERE id = ? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (! $stmt) throw new Exception('Prepare failed: ' . $conn->error);
    $stmt->bind_param('i', $id);
    if (! $stmt->execute()) throw new Exception('Execute failed: ' . $stmt->error);

    $affected = $stmt->affected_rows;
    $stmt->close();
    $conn->close();

    if ($affected > 0) {
        echo json_encode(['success' => true, 'message' => 'Product deleted.', 'id' => $id]);
    } else {
        echo json_encode(['success' => false, 'message' => 'No product deleted (not found).']);
    }
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
    exit;
}
