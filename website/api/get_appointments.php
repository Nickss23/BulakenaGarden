<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

header('Content-Type: application/json; charset=utf-8');
try {
    require_once __DIR__ . '/../../includes/config.php';
    $status = isset($_GET['status']) ? trim($_GET['status']) : '';
    $service = isset($_GET['service']) ? trim($_GET['service']) : '';
    $email = isset($_GET['email']) ? trim($_GET['email']) : '';

    // Allow admin requests to fetch all appointments by providing admin=1
    $isAdmin = isset($_GET['admin']) && trim($_GET['admin']) === '1';
    if ($isAdmin) {
        auth_require_admin_json();
    } elseif ($email !== '') {
        auth_start_session();
        $sessionUser = $_SESSION['user'] ?? null;
        $sessionEmail = is_array($sessionUser) ? strtolower(trim((string) ($sessionUser['email'] ?? ''))) : '';
        if ($sessionEmail === '' || $sessionEmail !== strtolower($email)) {
            auth_respond_json(403, ['success' => false, 'message' => 'You may only view your own appointments.']);
        }
    }

    // For privacy: require an email parameter for non-admin requests so the
    // endpoint never returns all appointments when no user context is provided.
    if (!$isAdmin && $email === '') {
        echo json_encode([]);
        $conn->close();
        exit;
    }

    $where = [];
    $params = [];
    $types = '';
    if ($status !== '') { $where[] = '`status` = ?'; $params[] = $status; $types .= 's'; }
    if ($service !== '') { $where[] = '`service` = ?'; $params[] = $service; $types .= 's'; }
    if ($email !== '') { $where[] = '`email` = ?'; $params[] = $email; $types .= 's'; }

    $reviewSelect = '0 AS review_count, 0 AS has_review';
    $feedbackTable = $conn->query("SHOW TABLES LIKE 'feedback'");
    $hasFeedbackTable = $feedbackTable instanceof mysqli_result && $feedbackTable->num_rows > 0;
    if ($feedbackTable instanceof mysqli_result) $feedbackTable->free();
    if ($hasFeedbackTable) {
        $feedbackCols = [];
        $feedbackColResult = $conn->query("SHOW COLUMNS FROM `feedback`");
        if ($feedbackColResult instanceof mysqli_result) {
            while ($col = $feedbackColResult->fetch_assoc()) {
                $feedbackCols[] = (string) ($col['Field'] ?? '');
            }
            $feedbackColResult->free();
        }
        if (in_array('appointment_id', $feedbackCols, true)) {
            $reviewSelect = '(SELECT COUNT(*) FROM `feedback` f WHERE f.`appointment_id` = appointments.`id`) AS review_count, EXISTS(SELECT 1 FROM `feedback` f2 WHERE f2.`appointment_id` = appointments.`id` LIMIT 1) AS has_review';
        }
    }

    $sql = 'SELECT id, name, name AS full_name, email, phone, phone AS phone_number, address, service, service AS desired_service, dt, DATE_FORMAT(dt, "%Y-%m-%d %H:%i:%s") AS appointment_sort, DATE_FORMAT(dt, "%Y-%m-%d") AS preferred_date, DATE_FORMAT(dt, "%Y-%m-%d") AS appointment_date, DATE_FORMAT(dt, "%H:%i") AS appointment_time, status, notes, reference_img, created_at, ' . $reviewSelect . ' FROM `appointments`';
    if (count($where)) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY id ASC LIMIT 1000';

    if (count($params) === 0) {
        $res = $conn->query($sql);
        if ($res === false) throw new Exception($conn->error);
        $rows = [];
        while ($r = $res->fetch_assoc()) $rows[] = $r;
        echo json_encode($rows);
        $res->free();
        $conn->close();
        exit;
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) throw new Exception($conn->error);
    $stmt->bind_param($types, ...$params);
    if (!$stmt->execute()) throw new Exception($stmt->error);
    $result = $stmt->get_result();
    $rows = [];
    while ($r = $result->fetch_assoc()) $rows[] = $r;
    echo json_encode($rows);
    $result->free();
    $stmt->close();
    $conn->close();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

?>
