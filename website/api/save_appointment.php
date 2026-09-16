<?php
header('Content-Type: application/json; charset=utf-8');
mysqli_report(MYSQLI_REPORT_OFF);
// Enable verbose errors for debugging (development only)
@ini_set('display_errors', '1');
@ini_set('display_startup_errors', '1');
error_reporting(E_ALL);
// Local error log for this script
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../logs/save_appointment_error.log');

function respond($status, $payload) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Use POST']);
}

try {
    require_once __DIR__ . '/../../includes/config.php';

    $name = trim((string)($_POST['full_name'] ?? $_POST['name'] ?? ''));
    $email = trim((string)($_POST['email'] ?? ''));
    $phone = trim((string)($_POST['phone_number'] ?? $_POST['phone'] ?? ''));
    $address = trim((string)($_POST['address'] ?? ''));
    $service = trim((string)($_POST['desired_service'] ?? $_POST['service'] ?? ''));
    $preferred_date = trim((string)($_POST['preferred_date'] ?? $_POST['dt'] ?? ''));
    $preferred_time = trim((string)($_POST['preferred_time'] ?? '09:00'));
    $message = trim((string)($_POST['message'] ?? $_POST['notes'] ?? ''));

    if ($name === '' || $preferred_date === '') {
        respond(422, ['success' => false, 'message' => 'Name and preferred date are required.']);
    }
    if (!preg_match('/^[0-9]{11}$/', $phone)) {
        respond(422, ['success' => false, 'message' => 'Phone number must contain exactly 11 digits.']);
    }

    // Convert the requested appointment date to a stable local DATETIME.
    $tz = new DateTimeZone('Asia/Singapore');
    $dtObj = null;
    $preferred_date = trim($preferred_date);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $preferred_date)) {
        $timeValue = preg_match('/^\d{2}:\d{2}$/', $preferred_time) ? $preferred_time : '09:00';
        $dtObj = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $preferred_date . ' ' . $timeValue . ':00', $tz);
    } else {
        $formats = ['Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d\TH:i:s', 'Y-m-d\TH:i', 'm/d/Y H:i:s', 'm/d/Y H:i', 'm/d/Y'];
        foreach ($formats as $format) {
            $candidate = DateTimeImmutable::createFromFormat($format, $preferred_date, $tz);
            if ($candidate instanceof DateTimeImmutable) {
                $dtObj = $candidate;
                break;
            }
        }
        if ($dtObj instanceof DateTimeImmutable && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dtObj->format('Y-m-d'))) {
            $dtObj = $dtObj->setTime(9, 0, 0);
        }
    }
    if (!$dtObj instanceof DateTimeImmutable) {
        $fallbackTs = strtotime($preferred_date);
        if ($fallbackTs === false) {
            respond(422, ['success' => false, 'message' => 'Invalid date format.']);
        }
        $dtObj = (new DateTimeImmutable('@' . $fallbackTs))->setTimezone($tz);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $preferred_date)) {
            $dtObj = $dtObj->setTime(9, 0, 0);
        }
    }
    $dt = $dtObj->format('Y-m-d H:i:s');

    // Handle uploaded reference image (optional)
    $referenceImgName = null;
    if (!empty($_FILES['reference_image']) && is_uploaded_file($_FILES['reference_image']['tmp_name'])) {
        $upDir = __DIR__ . '/../../uploads';
        if (!is_dir($upDir)) @mkdir($upDir, 0755, true);
        $orig = basename($_FILES['reference_image']['name']);
        $ext = pathinfo($orig, PATHINFO_EXTENSION);
        $safe = preg_replace('/[^a-zA-Z0-9-_\.]/', '_', pathinfo($orig, PATHINFO_FILENAME));
        $targetName = time() . '_' . $safe . ($ext ? '.' . $ext : '');
        $targetPath = $upDir . '/' . $targetName;
        if (@move_uploaded_file($_FILES['reference_image']['tmp_name'], $targetPath)) {
            $referenceImgName = 'uploads/' . $targetName;
        }
    }

    // Insert into DB
    $sql = "INSERT INTO `appointments` (`name`,`email`,`phone`,`address`,`service`,`dt`,`notes`,`reference_img`) VALUES (?,?,?,?,?,?,?,?)";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        $prepareErr = $conn->error;
        error_log('[save_appointment] prepare failed: ' . $prepareErr);
        // If the appointments table is missing, attempt to create it and retry once
        if (stripos($prepareErr, "doesn't exist") !== false || stripos($prepareErr, 'unknown table') !== false) {
            $createSql = "CREATE TABLE IF NOT EXISTS `appointments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) DEFAULT NULL,
  `phone` VARCHAR(60) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `service` VARCHAR(100) DEFAULT NULL,
  `dt` DATETIME NOT NULL,
  `status` ENUM('pending','confirmed','done','cancelled') DEFAULT 'pending',
  `notes` TEXT,
  `reference_img` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(`id`),
  KEY `idx_appt_dt` (`dt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
            if ($conn->query($createSql) !== false) {
                error_log('[save_appointment] created appointments table, retrying prepare');
                // retry prepare
                $stmt = $conn->prepare($sql);
            } else {
                error_log('[save_appointment] create table failed: ' . $conn->error);
            }
        }

        // If prepare still failed due to unknown column, attempt to add missing columns then retry
        if (!$stmt && (stripos($prepareErr, 'Unknown column') !== false || stripos($prepareErr, "unknown column") !== false)) {
            // Inspect which columns exist
            $existing = [];
            $colRes = $conn->query("SHOW COLUMNS FROM `appointments`");
            if ($colRes !== false) {
                while ($c = $colRes->fetch_assoc()) $existing[] = $c['Field'];
                $colRes->free();
            }
            $toAdd = [];
            if (!in_array('address', $existing)) $toAdd[] = "ADD COLUMN `address` TEXT DEFAULT NULL";
            if (!in_array('reference_img', $existing)) $toAdd[] = "ADD COLUMN `reference_img` VARCHAR(255) DEFAULT NULL";
            if (!in_array('status', $existing)) $toAdd[] = "ADD COLUMN `status` ENUM('pending','confirmed','done','cancelled') DEFAULT 'pending'";
            if (!empty($toAdd)) {
                $alterSql = 'ALTER TABLE `appointments` ' . implode(', ', $toAdd);
                if ($conn->query($alterSql) !== false) {
                    error_log('[save_appointment] altered appointments table to add missing columns');
                    $stmt = $conn->prepare($sql);
                } else {
                    error_log('[save_appointment] alter table failed: ' . $conn->error);
                }
            }
        }
    }
    if (!$stmt) {
        $errMsg = $conn->error ?? ($prepareErr ?? 'unknown');
        respond(500, ['success' => false, 'message' => 'Prepare failed', 'error' => $errMsg]);
    }
    $stmt->bind_param('ssssssss', $name, $email, $phone, $address, $service, $dt, $message, $referenceImgName);
    if (!$stmt->execute()) {
        $err = $stmt->error;
        error_log('[save_appointment] execute failed: ' . $err);
        $stmt->close();
        $conn->close();
        respond(500, ['success' => false, 'message' => 'Insert failed', 'error' => $err]);
    }

    $insertId = $stmt->insert_id;
    $stmt->close();
    $conn->close();

    respond(200, ['success' => true, 'id' => $insertId, 'message' => 'Appointment saved']);

} catch (Throwable $e) {
    error_log('[save_appointment] exception: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
}

?>
