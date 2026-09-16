<?php
header('Content-Type: application/json; charset=utf-8');

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Use POST to delete user.']);
        exit;
    }

    require_once __DIR__ . '/../../includes/config.php';

    $id = isset($_POST['id']) ? (int) $_POST['id'] : 0;
    if ($id <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Invalid user id.']);
        exit;
    }

    $stmt = $conn->prepare('DELETE FROM `users` WHERE id = ?');
    if (! $stmt) throw new Exception('Prepare failed: ' . $conn->error);
    $stmt->bind_param('i', $id);
    if (! $stmt->execute()) throw new Exception('Execute failed: ' . $stmt->error);

    $affected = $stmt->affected_rows;
    $stmt->close();
    $conn->close();

    echo json_encode(['success' => true, 'deleted' => $affected]);
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

?>
