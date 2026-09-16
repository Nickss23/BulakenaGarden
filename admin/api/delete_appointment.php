<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

header('Content-Type: application/json; charset=utf-8');
mysqli_report(MYSQLI_REPORT_OFF);

try {
    require_once __DIR__ . '/../../includes/config.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        auth_respond_json(405, ['success' => false, 'message' => 'Use POST']);
    }

    $id = isset($_POST['id']) ? (int) $_POST['id'] : 0;
    if ($id <= 0) {
        auth_respond_json(422, ['success' => false, 'message' => 'Invalid appointment id']);
    }

    $isAdmin = auth_session_is_admin();
    $sessionEmail = '';

    if (!$isAdmin) {
        auth_start_session();
        $sessionUser = $_SESSION['user'] ?? null;
        if (!is_array($sessionUser) || empty($sessionUser['email'])) {
            auth_respond_json(403, ['success' => false, 'message' => 'Please sign in to delete an appointment.']);
        }
        $sessionEmail = strtolower(trim((string) $sessionUser['email']));
    }

    $stmt = $conn->prepare('SELECT `id`, `email` FROM `appointments` WHERE `id` = ? LIMIT 1');
    if (!$stmt) {
        auth_respond_json(500, ['success' => false, 'message' => 'Failed to prepare lookup', 'error' => $conn->error]);
    }
    $stmt->bind_param('i', $id);
    if (!$stmt->execute()) {
        $err = $stmt->error ?: $conn->error;
        $stmt->close();
        auth_respond_json(500, ['success' => false, 'message' => 'Lookup failed', 'error' => $err]);
    }
    $result = $stmt->get_result();
    $row = $result instanceof mysqli_result ? $result->fetch_assoc() : null;
    if ($result instanceof mysqli_result) {
        $result->free();
    }
    $stmt->close();

    if (!$row) {
        auth_respond_json(404, ['success' => false, 'message' => 'Appointment not found']);
    }

    if (!$isAdmin) {
        $rowEmail = strtolower(trim((string) ($row['email'] ?? '')));
        if ($rowEmail === '' || $rowEmail !== $sessionEmail) {
            auth_respond_json(403, ['success' => false, 'message' => 'You may only delete your own appointments.']);
        }
    }

    $delete = $conn->prepare('DELETE FROM `appointments` WHERE `id` = ? LIMIT 1');
    if (!$delete) {
        auth_respond_json(500, ['success' => false, 'message' => 'Failed to prepare delete', 'error' => $conn->error]);
    }
    $delete->bind_param('i', $id);
    if (!$delete->execute()) {
        $err = $delete->error ?: $conn->error;
        $delete->close();
        auth_respond_json(500, ['success' => false, 'message' => 'Delete failed', 'error' => $err]);
    }
    $affected = $delete->affected_rows;
    $delete->close();

    auth_respond_json(200, ['success' => true, 'message' => 'Appointment deleted', 'affected' => $affected]);
} catch (Throwable $e) {
    auth_respond_json(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}

