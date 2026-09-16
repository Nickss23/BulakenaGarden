<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
require_once __DIR__ . '/../../includes/gmail_smtp_config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    auth_respond_json(405, ['success' => false, 'message' => 'Method not allowed. Use POST.']);
}

try {
    $email = auth_normalize_email((string) ($_POST['email'] ?? ''));
    $userId = isset($_POST['user_id']) ? (int) $_POST['user_id'] : 0;

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        auth_respond_json(422, ['success' => false, 'message' => 'Please provide a valid email.']);
    }

    require_once __DIR__ . '/../../includes/config.php';

    // User-id flow: resend to an existing unverified account.
    if ($userId > 0) {
        $schema = auth_get_user_schema($conn);
        if ($schema['password'] === null) {
            auth_respond_json(500, ['success' => false, 'message' => 'The users table does not support passwords.']);
        }

        $stmt = $conn->prepare("SELECT `id`, `{$schema['name']}` AS full_name, `{$schema['email']}` AS email FROM `users` WHERE `id` = ? LIMIT 1");
        if (!$stmt) {
            auth_respond_json(500, ['success' => false, 'message' => 'Database error.']);
        }

        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $result = $stmt->get_result();
        $user = $result instanceof mysqli_result ? $result->fetch_assoc() : null;
        if ($result instanceof mysqli_result) {
            $result->free();
        }
        $stmt->close();

        if (!is_array($user)) {
            auth_respond_json(404, ['success' => false, 'message' => 'User not found.']);
        }

        $userEmail = auth_normalize_email((string) ($user['email'] ?? ''));
        if ($email !== $userEmail) {
            auth_respond_json(400, ['success' => false, 'message' => 'Email does not match the selected account.']);
        }

        $verificationCode = generate_verification_code();
        if (!auth_save_verification_code($conn, $userId, $verificationCode)) {
            auth_respond_json(500, ['success' => false, 'message' => 'Failed to update verification code.']);
        }

        $emailSent = send_verification_email($userEmail, (string) ($user['full_name'] ?? ''), $verificationCode);
        if ($emailSent) {
            auth_respond_json(200, ['success' => true, 'message' => 'A new verification code has been sent to your email.']);
        }

        auth_respond_json(500, ['success' => false, 'message' => 'Failed to send verification email. Please try again later.']);
    }

    // Pending-registration flow: resend for the session-based signup process.
    auth_start_session();
    $pending = $_SESSION['pending_registration'] ?? null;
    if (!$pending) {
        auth_respond_json(400, ['success' => false, 'message' => 'No pending registration found. Please start the registration process again.']);
    }

    if ($pending['email'] !== $email) {
        auth_respond_json(400, ['success' => false, 'message' => 'Email does not match pending registration.']);
    }

    if (time() > ($pending['expires'] ?? 0)) {
        unset($_SESSION['pending_registration']);
        auth_respond_json(400, ['success' => false, 'message' => 'Registration session expired. Please start the registration process again.']);
    }

    $verificationCode = generate_verification_code();
    $_SESSION['pending_registration']['verification_code'] = $verificationCode;
    $_SESSION['pending_registration']['expires'] = time() + (15 * 60);

    $emailSent = send_verification_email($email, $pending['name'], $verificationCode);
    if ($emailSent) {
        auth_respond_json(200, ['success' => true, 'message' => 'A new verification code has been sent to your email.']);
    }

    auth_respond_json(500, ['success' => false, 'message' => 'Failed to send verification email. Please try again later.']);

} catch (Throwable $e) {
    auth_respond_json(500, ['success' => false, 'message' => 'Server error while sending verification code.', 'error' => $e->getMessage()]);
}
?>
