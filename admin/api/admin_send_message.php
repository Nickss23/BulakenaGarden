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
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['success' => false, 'error' => 'Method not allowed']);
  require_once __DIR__ . '/../../includes/config.php';
  require_once __DIR__ . '/../../includes/gmail_smtp_config.php';
  ensure_messages_table($conn);

  $threadKey = isset($_POST['thread_key']) ? trim((string)$_POST['thread_key']) : '';
  $message = isset($_POST['message']) ? trim((string)$_POST['message']) : '';
  if ($threadKey === '') respond(422, ['success' => false, 'error' => 'thread_key is required']);
  if ($message === '') respond(422, ['success' => false, 'error' => 'Message is required']);
  if (strlen($threadKey) > 191) $threadKey = substr($threadKey, 0, 191);
  if (strlen($message) > 8000) $message = substr($message, 0, 8000);

  // Attempt to carry forward the latest known name/email for the thread.
  $name = null;
  $email = null;
  $stmt0 = $conn->prepare("SELECT `name`, `email` FROM `contact_messages` WHERE `thread_key` = ? ORDER BY `id` DESC LIMIT 1");
  if ($stmt0) {
    $stmt0->bind_param('s', $threadKey);
    if ($stmt0->execute()) {
      $res0 = $stmt0->get_result();
      if ($res0 && ($row0 = $res0->fetch_assoc())) {
        $name = $row0['name'] ?? null;
        $email = $row0['email'] ?? null;
      }
    }
    $stmt0->close();
  }

  $stmt = $conn->prepare("INSERT INTO `contact_messages` (`thread_key`, `name`, `email`, `sender`, `message`, `is_read`)
                           VALUES (?, ?, ?, 'admin', ?, 1)");
  if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);
  $stmt->bind_param('ssss', $threadKey, $name, $email, $message);
  if (!$stmt->execute()) throw new Exception('Insert failed: ' . $stmt->error);
  $id = $stmt->insert_id;
  $stmt->close();

  $emailSent = false;
  $emailError = null;
  $recipientEmail = '';
  $recipientName = '';

  if (is_string($email) && $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $recipientEmail = $email;
    $recipientName = is_string($name) && $name !== '' ? $name : $email;

    $safeName = htmlspecialchars($recipientName, ENT_QUOTES, 'UTF-8');
    $safeMessage = nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));
    $safeAdminName = htmlspecialchars(GMAIL_FROM_NAME, ENT_QUOTES, 'UTF-8');
    $safeEmail = htmlspecialchars($recipientEmail, ENT_QUOTES, 'UTF-8');
    $subject = 'New reply from Bulakena Garden';
    $htmlBody = '
      <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f7f7f2; padding: 24px;">
        <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 28px; border: 1px solid #e8e1d4;">
          <h2 style="margin-top: 0; color: #1a3d2b;">You have a new reply</h2>
          <p>Hello ' . $safeName . ',</p>
          <p>The Bulakena Garden admin has replied to your message. You can continue the conversation by replying to this email.</p>
          <div style="margin: 24px 0; padding: 18px; border-left: 4px solid #2d6a4f; background: #f9f6f0;">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #6b8f71; margin-bottom: 8px;">Admin reply</div>
            <div style="font-size: 15px; color: #1a2e1e;">' . $safeMessage . '</div>
          </div>
          <p style="margin-bottom: 0; color: #6b8f71; font-size: 13px;">
            Sent by ' . $safeAdminName . ' to ' . $safeEmail . '
          </p>
        </div>
      </body>
      </html>';
    $textBody = "Hello {$recipientName},\n\n"
      . "The Bulakena Garden admin has replied to your message.\n\n"
      . "Admin reply:\n{$message}\n\n"
      . "You can continue the conversation by replying to this email.\n";

    $emailSent = send_gmail_email($recipientEmail, $recipientName, $subject, $htmlBody, $textBody);
    if (!$emailSent) {
      $emailError = 'Reply saved, but email delivery failed.';
    }
  } else {
    $emailError = 'Reply saved, but the thread does not have a valid customer email.';
  }

  $conn->close();

  respond(200, [
    'success' => true,
    'id' => $id,
    'email_sent' => $emailSent,
    'recipient_email' => $recipientEmail,
    'email_error' => $emailError
  ]);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'error' => $e->getMessage()]);
}

?>
