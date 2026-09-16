<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

/**
 * Validates password strength
 * Returns empty string if valid, or error message if invalid
 */
function validatePasswordStrength(string $password): string {
    $length = strlen($password);
    
    // Minimum 8 characters
    if ($length < 8) {
        return 'Password must be at least 8 characters long.';
    }
    
    // Must contain lowercase
    if (!preg_match('/[a-z]/', $password)) {
        return 'Password must contain at least one lowercase letter.';
    }
    
    // Must contain uppercase
    if (!preg_match('/[A-Z]/', $password)) {
        return 'Password must contain at least one uppercase letter.';
    }
    
    // Must contain number
    if (!preg_match('/[0-9]/', $password)) {
        return 'Password must contain at least one number.';
    }
    
    // Must contain special character
    if (!preg_match('/[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]/', $password)) {
        return 'Password must contain at least one special character.';
    }
    
    return '';
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    auth_respond_json(405, ['success' => false, 'message' => 'Method not allowed. Use POST.']);
}

$email = auth_normalize_email((string) ($_POST['email'] ?? ''));
$code = trim((string) ($_POST['code'] ?? ''));
$newPassword = (string) ($_POST['new_password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_respond_json(422, ['success' => false, 'message' => 'Please provide a valid email.']);
}
if (strlen($code) !== 6 || !ctype_digit($code)) {
    auth_respond_json(422, ['success' => false, 'message' => 'Reset code must be 6 digits.']);
}

// Validate password strength
$passwordError = validatePasswordStrength($newPassword);
if ($passwordError) {
    auth_respond_json(422, ['success' => false, 'message' => $passwordError]);
}

try {
    auth_start_session();
    $pending = $_SESSION['pending_password_reset'] ?? null;
    if (!is_array($pending)) {
        auth_respond_json(400, ['success' => false, 'message' => 'No pending password reset found. Please request a new code.']);
    }

    if (time() > (int) ($pending['expires'] ?? 0)) {
        unset($_SESSION['pending_password_reset']);
        auth_respond_json(400, ['success' => false, 'message' => 'Reset code expired. Please request a new code.']);
    }

    if (auth_normalize_email((string) ($pending['email'] ?? '')) !== $email) {
        auth_respond_json(400, ['success' => false, 'message' => 'Email does not match the requested reset.']);
    }

    if (!hash_equals((string) ($pending['code'] ?? ''), $code)) {
        auth_respond_json(401, ['success' => false, 'message' => 'Invalid reset code. Please try again.']);
    }

    require_once __DIR__ . '/../../includes/config.php';
    $schema = auth_get_user_schema($conn);
    if ($schema['password'] === null) {
        auth_respond_json(500, ['success' => false, 'message' => 'The users table does not support passwords.']);
    }

    $userRow = auth_fetch_user_by_email($conn, $schema, $email);
    if (!$userRow) {
        unset($_SESSION['pending_password_reset']);
        auth_respond_json(404, ['success' => false, 'message' => 'User not found.']);
    }

    $hashedPassword = auth_hash_password_if_needed($newPassword);
    $stmt = $conn->prepare("UPDATE `users` SET `{$schema['password']}` = ? WHERE `{$schema['email']}` = ?");
    if (!$stmt) {
        auth_respond_json(500, ['success' => false, 'message' => 'Failed to prepare password reset query.', 'error' => $conn->error]);
    }

    $stmt->bind_param('ss', $hashedPassword, $email);
    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();
        auth_respond_json(500, ['success' => false, 'message' => 'Failed to update password.', 'error' => $error]);
    }
    $stmt->close();

    unset($_SESSION['pending_password_reset']);

    auth_respond_json(200, [
        'success' => true,
        'message' => 'Password updated successfully. You can now sign in.',
    ]);
} catch (Throwable $e) {
    auth_respond_json(500, ['success' => false, 'message' => 'Server error while resetting password.', 'error' => $e->getMessage()]);
}
