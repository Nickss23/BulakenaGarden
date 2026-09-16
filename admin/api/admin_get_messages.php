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

  $threadKey = isset($_GET['thread_key']) ? trim((string)$_GET['thread_key']) : '';
  if ($threadKey === '') respond(422, ['success' => false, 'error' => 'thread_key is required']);
  if (strlen($threadKey) > 191) $threadKey = substr($threadKey, 0, 191);

  $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 300;
  if ($limit <= 0 || $limit > 1000) $limit = 300;

  // Mark user messages as read when admin opens the thread (default true).
  $markRead = !isset($_GET['mark_read']) || $_GET['mark_read'] === '1' || $_GET['mark_read'] === 1;

  if ($markRead) {
    $upd = $conn->prepare("UPDATE `contact_messages` SET `is_read` = 1 WHERE `thread_key` = ? AND `sender` = 'user' AND `is_read` = 0");
    if ($upd) {
      $upd->bind_param('s', $threadKey);
      $upd->execute();
      $upd->close();
    }
  }

  $stmt = $conn->prepare("SELECT `id`, `thread_key`, `name`, `email`, `sender`, `message`, `is_read`, `created_at`
                          FROM `contact_messages`
                          WHERE `thread_key` = ?
                          ORDER BY `id` ASC
                          LIMIT " . (int)$limit);
  if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);
  $stmt->bind_param('s', $threadKey);
  if (!$stmt->execute()) throw new Exception('Execute failed: ' . $stmt->error);
  $res = $stmt->get_result();

  $rows = [];
  while ($r = $res->fetch_assoc()) $rows[] = $r;
  $stmt->close();
  $conn->close();

  echo json_encode($rows);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'error' => $e->getMessage()]);
}

?>
