<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../includes/auth_common.php';

function respond($status, $payload) {
  http_response_code($status);
  echo json_encode($payload);
  exit;
}

function ensure_messages_table($conn) {
  $sql = "CREATE TABLE IF NOT EXISTS `contact_messages` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `thread_key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) DEFAULT NULL,
    `email` VARCHAR(191) DEFAULT NULL,
    `sender` ENUM('user','admin') NOT NULL DEFAULT 'user',
    `message` TEXT NOT NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_contact_messages_thread_created` (`thread_key`, `created_at`),
    KEY `idx_contact_messages_unread` (`thread_key`, `sender`, `is_read`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
  if (!$conn->query($sql)) throw new Exception('Failed to ensure contact_messages table: ' . $conn->error);
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['success' => false, 'error' => 'Method not allowed']);

  auth_start_session();
  $sessionUser = $_SESSION['user'] ?? null;
  if (!is_array($sessionUser) || empty($sessionUser['email'])) {
    respond(401, [
      'success' => false,
      'code' => 'AUTH_REQUIRED',
      'error' => 'AUTH_REQUIRED',
      'message' => 'Please sign in before sending a message.'
    ]);
  }

  require_once __DIR__ . '/../../includes/config.php';
  ensure_messages_table($conn);

  $name = isset($_POST['name']) ? trim((string)$_POST['name']) : '';
  $email = isset($_POST['email']) ? trim((string)$_POST['email']) : '';
  $message = isset($_POST['message']) ? trim((string)$_POST['message']) : '';

  if ($message === '') respond(422, ['success' => false, 'error' => 'Message is required']);

  $name = trim((string)($sessionUser['name'] ?? $name));
  $email = trim((string)($sessionUser['email'] ?? $email));

  if ($name === '') respond(422, ['success' => false, 'error' => 'Name is required']);
  if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) respond(422, ['success' => false, 'error' => 'Valid email is required']);

  if (strlen($name) > 191) $name = substr($name, 0, 191);
  if (strlen($email) > 191) $email = substr($email, 0, 191);
  if (strlen($message) > 8000) $message = substr($message, 0, 8000);

  $threadKey = strtolower($email);

  $sql = "INSERT INTO `contact_messages` (`thread_key`, `name`, `email`, `sender`, `message`, `is_read`)
          VALUES (?, ?, ?, 'user', ?, 0)";
  $stmt = $conn->prepare($sql);
  if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);
  $stmt->bind_param('ssss', $threadKey, $name, $email, $message);
  if (!$stmt->execute()) throw new Exception('Insert failed: ' . $stmt->error);
  $id = $stmt->insert_id;
  $stmt->close();
  $conn->close();

  respond(200, ['success' => true, 'id' => $id, 'thread_key' => $threadKey]);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'error' => $e->getMessage()]);
}

?>
