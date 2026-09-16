<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    auth_respond_json(405, ['success' => false, 'message' => 'Method not allowed. Use POST.']);
}

$email = auth_normalize_email((string) ($_POST['email'] ?? ''));
$plainPassword = (string) ($_POST['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_respond_json(422, ['success' => false, 'message' => 'A valid email is required.']);
}

if (strlen($plainPassword) < 6) {
    auth_respond_json(422, ['success' => false, 'message' => 'Password must be at least 6 characters.']);
}

try {
    require_once __DIR__ . '/../../includes/config.php';
    $schema = auth_get_user_schema($conn);
    if ($schema['password'] === null) {
        auth_respond_json(500, ['success' => false, 'message' => 'The users table does not support passwords.']);
    }

    $userRow = auth_fetch_user_by_email_with_verification($conn, $schema, $email);
    if (!$userRow || !auth_verify_password($plainPassword, (string) ($userRow['password_hash'] ?? ''))) {
        auth_respond_json(401, ['success' => false, 'message' => 'Invalid email or password.']);
    }

    if (strtolower((string) ($userRow['status'] ?? 'active')) === 'inactive') {
        auth_respond_json(403, ['success' => false, 'message' => 'This account is inactive.']);
    }

    // Check if email is verified
    $isVerified = (bool) ($userRow['is_verified'] ?? true);
    if (!$isVerified) {
        auth_respond_json(403, [
            'success' => false,
            'code' => 'EMAIL_NOT_VERIFIED',
            'message' => 'Please verify your email address before logging in.',
            'user_id' => (int) $userRow['id'],
            'email' => $email,
        ]);
    }

    if (auth_needs_rehash_or_upgrade((string) ($userRow['password_hash'] ?? ''))) {
        $rehash = auth_hash_password_if_needed($plainPassword);
        $stmt = $conn->prepare("UPDATE `users` SET `{$schema['password']}` = ? WHERE id = ?");
        if ($stmt) {
            $userId = (int) $userRow['id'];
            $stmt->bind_param('si', $rehash, $userId);
            $stmt->execute();
            $stmt->close();
        }
    }

    auth_start_session();
    session_regenerate_id(true);
    $_SESSION['user'] = auth_build_session_user($userRow);

    auth_respond_json(200, [
        'success' => true,
        'message' => 'Login successful.',
        'user' => $_SESSION['user'],
    ]);
} catch (Throwable $e) {
    auth_respond_json(500, ['success' => false, 'message' => 'Server error while logging in.', 'error' => $e->getMessage()]);
}
