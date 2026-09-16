<?php
header('Content-Type: application/json; charset=utf-8');
mysqli_report(MYSQLI_REPORT_OFF);
@ini_set('display_errors', '1');
@ini_set('display_startup_errors', '1');
error_reporting(E_ALL);
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../logs/update_appointment_status_error.log');
try {
    require_once __DIR__ . '/../../includes/config.php';
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Use POST']);
        exit;
    }
    $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
    $status = isset($_POST['status']) ? trim($_POST['status']) : '';
    $allowed = ['pending','confirmed','done','cancelled'];
    if (!$id || !$status || !in_array($status, $allowed, true)) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Invalid id or status']);
        exit;
    }

    $currentStatus = null;
    $appointment = null;
    $currentStmt = $conn->prepare('SELECT `id`, `status`, `name`, `phone`, `service`, `dt`, `email` FROM `appointments` WHERE `id` = ? LIMIT 1');
    if ($currentStmt) {
        $currentStmt->bind_param('i', $id);
        if ($currentStmt->execute()) {
            $result = $currentStmt->get_result();
            if ($result && ($row = $result->fetch_assoc())) {
                $appointment = $row;
                $currentStatus = strtolower(trim((string)($row['status'] ?? '')));
            }
            if ($result) $result->free();
        }
        $currentStmt->close();
    }

    if (!$appointment) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Appointment not found.']);
        exit;
    }

    if ($currentStatus === 'done' || $currentStatus === 'cancelled') {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Completed or cancelled appointments cannot be changed.']);
        exit;
    }

    if ($currentStatus === 'confirmed' && in_array($status, ['pending', 'cancelled'], true)) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Confirmed appointments cannot be moved back to pending or cancelled.']);
        exit;
    }

    if ($status === 'done' && $currentStatus !== 'confirmed') {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Only confirmed appointments can be marked completed.']);
        exit;
    }

    $stmt = $conn->prepare('UPDATE `appointments` SET `status` = ?, `status_updated_at` = NOW() WHERE `id` = ?');
    if (!$stmt) {
        $prepareErr = $conn->error;
        error_log('[update_appointment_status] prepare failed: ' . $prepareErr);
        // If status_updated_at column missing, attempt to add it and retry
        if (stripos($prepareErr, 'Unknown column') !== false || stripos($prepareErr, 'unknown column') !== false) {
            $colRes = $conn->query("SHOW COLUMNS FROM `appointments`");
            $cols = [];
            if ($colRes !== false) {
                while ($c = $colRes->fetch_assoc()) $cols[] = $c['Field'];
                $colRes->free();
            }
            $toAdd = [];
            if (!in_array('status_updated_at', $cols)) $toAdd[] = "ADD COLUMN `status_updated_at` TIMESTAMP NULL DEFAULT NULL";
            if (!in_array('status', $cols)) $toAdd[] = "ADD COLUMN `status` ENUM('pending','confirmed','done','cancelled') DEFAULT 'pending'";
            if (!empty($toAdd)) {
                $alterSql = 'ALTER TABLE `appointments` ' . implode(', ', $toAdd);
                if ($conn->query($alterSql) !== false) {
                    error_log('[update_appointment_status] altered appointments table to add missing columns');
                    $stmt = $conn->prepare('UPDATE `appointments` SET `status` = ?, `status_updated_at` = NOW() WHERE `id` = ?');
                } else {
                    error_log('[update_appointment_status] alter table failed: ' . $conn->error);
                }
            }
        }
    }
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Prepare failed', 'error' => $conn->error]);
        exit;
    }
    $stmt->bind_param('si', $status, $id);
    if (!$stmt->execute()) {
        $err = $stmt->error;
        $stmt->close();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Execute failed', 'error' => $err]);
        exit;
    }
    $affected = $stmt->affected_rows;
    $stmt->close();

    $smsResultForResponse = null;
    $statusJustConfirmed = ($currentStatus !== 'confirmed' && $status === 'confirmed' && $affected >= 0);
    $statusJustCompleted = ($status === 'done' && $affected >= 0);
    $statusJustCancelled = ($status === 'cancelled' && $affected >= 0);
    
    if ($statusJustConfirmed || $statusJustCompleted || $statusJustCancelled) {
        include_once __DIR__ . '/../../includes/sms_helper.php';
        $phone = trim((string)($appointment['phone'] ?? ''));
        if ($phone !== '' && function_exists('normalize_phone_e164') && (function_exists('send_sms_detailed') || function_exists('send_sms'))) {
            try {
                $to = normalize_phone_e164($phone);
                if ($to) {
                    // Build the message based on status
                    if ($statusJustCompleted) {
                        $message = 'Your appointment has been completed. Thank you for visiting Bulakena Garden!';
                        $statusLabel = 'completion';
                    } elseif ($statusJustCancelled) {
                        $customerName = trim((string)($appointment['name'] ?? ''));
                        $message = 'Hi, ' . $customerName . ' your appointment today is cancelled due to high bookings. Please advise a new schedule. Thank you.';
                        $statusLabel = 'cancellation';
                    } else {
                        // Confirmed status
                        $message = function_exists('build_appointment_confirm_sms')
                            ? build_appointment_confirm_sms($appointment)
                            : 'Your appointment has been confirmed. Our team will be ready to assist you at your scheduled time. If you have any questions or need to make changes, feel free to contact us.';
                        $statusLabel = 'confirmation';
                    }
                    
                    $smsResult = function_exists('send_sms_detailed')
                        ? send_sms_detailed($to, $message)
                        : ['ok' => send_sms($to, $message), 'recipient' => $to];
                    $smsResultForResponse = [
                        'attempted_at' => date('Y-m-d H:i:s'),
                        'ok' => !empty($smsResult['ok']),
                        'provider' => (string)($smsResult['provider'] ?? 'unknown'),
                        'delivery_state' => (string)($smsResult['delivery_state'] ?? (!empty($smsResult['ok']) ? 'accepted' : 'failed')),
                        'accepted' => !empty($smsResult['accepted']),
                        'simulated' => !empty($smsResult['simulated']),
                        'http_code' => isset($smsResult['http_code']) ? (int)$smsResult['http_code'] : 0,
                        'message_id' => isset($smsResult['message_id']) ? (string)$smsResult['message_id'] : null,
                        'recipient' => (string)($smsResult['recipient'] ?? $to),
                        'reason' => isset($smsResult['reason']) ? (string)$smsResult['reason'] : null
                    ];
                    error_log('[update_appointment_status] ' . $statusLabel . ' SMS ' . ($smsResultForResponse['ok'] ? 'accepted' : 'failed') . ' for appointment ' . $id . ' to ' . $to);
                } else {
                    $smsResultForResponse = ['ok' => false, 'reason' => 'invalid_phone'];
                    error_log('[update_appointment_status] SMS phone normalization failed for appointment ' . $id . ': ' . $phone);
                }
            } catch (Throwable $e) {
                $smsResultForResponse = ['ok' => false, 'reason' => 'exception', 'error' => $e->getMessage()];
                error_log('[update_appointment_status] SMS exception for appointment ' . $id . ': ' . $e->getMessage());
            }
        } else {
            $smsResultForResponse = ['ok' => false, 'reason' => 'missing_phone_or_sms_helper'];
            error_log('[update_appointment_status] SMS not sent for appointment ' . $id . ': no phone or SMS helper missing');
        }
    }

    echo json_encode(['success' => true, 'affected' => $affected, 'sms' => $smsResultForResponse]);
    $conn->close();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}

?>
