<?php
header('Content-Type: application/json; charset=utf-8');

function respond($status, $payload) {
  http_response_code($status);
  echo json_encode($payload);
  exit;
}

try {
  require_once __DIR__ . '/../../includes/config.php';

  $appointment_id = isset($_POST['appointment_id']) ? trim((string)$_POST['appointment_id']) : '';
  $name = isset($_POST['name']) ? trim((string)$_POST['name']) : '';
  $email = isset($_POST['email']) ? trim((string)$_POST['email']) : '';
  $service = isset($_POST['service']) ? trim((string)$_POST['service']) : '';
  $rating = isset($_POST['rating']) ? (int)$_POST['rating'] : 0;
  $text = isset($_POST['text']) ? trim((string)$_POST['text']) : (isset($_POST['review']) ? trim((string)$_POST['review']) : '');
  $anonymous = (isset($_POST['anonymous']) && ($_POST['anonymous'] === '1' || $_POST['anonymous'] === 1)) ? 1 : 0;

  if ($rating < 1 || $rating > 5) respond(400, ['success' => false, 'error' => 'Rating must be between 1 and 5']);
  if ($service === '') respond(422, ['success' => false, 'error' => 'Service is required']);

  // uploads (optional)
  $uploadDir = __DIR__ . '/../../uploads/feedback/';
  if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
      throw new Exception('Failed to create uploads directory');
    }
  }

  $mediaPath = null;
  if (!empty($_FILES['media']) && is_array($_FILES['media'])) {
    $file = $_FILES['media'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
      if (($file['size'] ?? 0) > 10 * 1024 * 1024) respond(400, ['success' => false, 'error' => 'File too large (max 10MB)']);

      $finfo = finfo_open(FILEINFO_MIME_TYPE);
      $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : null;
      if ($finfo) finfo_close($finfo);
      $allowed = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/quicktime', 'video/webm'
      ];
      if (!$mime || !in_array($mime, $allowed, true)) respond(400, ['success' => false, 'error' => 'Unsupported file type']);

      $ext = pathinfo($file['name'] ?? '', PATHINFO_EXTENSION);
      $basename = bin2hex(random_bytes(8)) . '_' . time();
      $filename = $basename . ($ext ? '.' . $ext : '');
      $target = $uploadDir . $filename;
      if (move_uploaded_file($file['tmp_name'], $target)) {
        $mediaPath = 'uploads/feedback/' . $filename;
      }
    }
  }

  // Ensure feedback table exists
  $createSql = "CREATE TABLE IF NOT EXISTS `feedback` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `appointment_id` INT UNSIGNED DEFAULT NULL,
    `name` VARCHAR(191) DEFAULT NULL,
    `email` VARCHAR(191) DEFAULT NULL,
    `service` VARCHAR(120) NOT NULL,
    `rating` TINYINT UNSIGNED NOT NULL DEFAULT 5,
    `text` TEXT,
    `anonymous` TINYINT(1) DEFAULT 0,
    `media` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_feedback_service` (`service`),
    KEY `idx_feedback_appt` (`appointment_id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
  if (!$conn->query($createSql)) throw new Exception('Failed to ensure feedback table: ' . $conn->error);

  $apptIdParam = (is_numeric($appointment_id) && (int)$appointment_id > 0) ? (int)$appointment_id : null;
  if ($apptIdParam !== null) {
    $dupeStmt = $conn->prepare('SELECT `id` FROM `feedback` WHERE `appointment_id` = ? LIMIT 1');
    if (!$dupeStmt) throw new Exception('Duplicate check prepare failed: ' . $conn->error);
    $dupeStmt->bind_param('i', $apptIdParam);
    if (!$dupeStmt->execute()) throw new Exception('Duplicate check failed: ' . $dupeStmt->error);
    $dupeResult = $dupeStmt->get_result();
    $alreadyReviewed = $dupeResult && $dupeResult->num_rows > 0;
    if ($dupeResult) $dupeResult->free();
    $dupeStmt->close();
    if ($alreadyReviewed) {
      respond(409, ['success' => false, 'error' => 'This appointment has already been reviewed.']);
    }
  }

  $sql = "INSERT INTO `feedback` (appointment_id, name, email, service, rating, text, anonymous, media)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
  $stmt = $conn->prepare($sql);
  if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);

  $nameParam = $name !== '' ? $name : null;
  $emailParam = $email !== '' ? $email : null;
  $serviceParam = $service;
  $ratingParam = (int)$rating;
  $textParam = $text !== '' ? $text : null;
  $anonParam = (int)$anonymous;
  $mediaParam = $mediaPath === null ? null : $mediaPath;

  $stmt->bind_param('isssisis', $apptIdParam, $nameParam, $emailParam, $serviceParam, $ratingParam, $textParam, $anonParam, $mediaParam);
  if (!$stmt->execute()) throw new Exception('Insert failed: ' . $stmt->error);

  $insertId = $stmt->insert_id;
  $stmt->close();
  $conn->close();

  respond(200, ['success' => true, 'id' => $insertId]);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'error' => $e->getMessage()]);
}

?>
