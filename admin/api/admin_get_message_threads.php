<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
auth_require_admin_json();

header('Content-Type: application/json; charset=utf-8');

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
  require_once __DIR__ . '/../../includes/config.php';
  ensure_messages_table($conn);

  $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
  if ($limit <= 0 || $limit > 500) $limit = 200;

  $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
  $qEsc = $q !== '' ? $conn->real_escape_string($q) : '';

  // Get the last message row per thread_key and compute unread count for user messages.
  $sql = "SELECT cm.thread_key,
                 cm.name,
                 cm.email,
                 cm.message AS last_message,
                 cm.sender AS last_sender,
                 cm.created_at AS last_at,
                 (SELECT COUNT(*) FROM contact_messages u
                    WHERE u.thread_key = cm.thread_key AND u.sender = 'user' AND u.is_read = 0) AS unread
          FROM contact_messages cm
          INNER JOIN (
            SELECT thread_key, MAX(id) AS last_id
            FROM contact_messages
            GROUP BY thread_key
          ) x ON x.thread_key = cm.thread_key AND x.last_id = cm.id";

  if ($qEsc !== '') {
    $sql .= " WHERE (cm.thread_key LIKE '%$qEsc%' OR cm.name LIKE '%$qEsc%' OR cm.email LIKE '%$qEsc%' OR cm.message LIKE '%$qEsc%')";
  }

  $sql .= " ORDER BY cm.created_at DESC LIMIT " . (int)$limit;

  $res = $conn->query($sql);
  if (!$res) throw new Exception('Query failed: ' . $conn->error);

  $rows = [];
  while ($r = $res->fetch_assoc()) $rows[] = $r;
  $res->free();
  $conn->close();

  echo json_encode($rows);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'error' => $e->getMessage()]);
}

?>
