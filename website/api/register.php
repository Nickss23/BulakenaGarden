<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
require_once __DIR__ . '/../../includes/gmail_smtp_config.php';

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

$name = trim((string) ($_POST['name'] ?? ''));
$email = auth_normalize_email((string) ($_POST['email'] ?? ''));
$plainPassword = (string) ($_POST['password'] ?? '');
$phone = preg_replace('/\D+/', '', (string) ($_POST['phone'] ?? ''));
$region = trim((string) ($_POST['region'] ?? ''));
$province = trim((string) ($_POST['province'] ?? ''));
$municipality = trim((string) ($_POST['municipality'] ?? ''));
$barangay = trim((string) ($_POST['barangay'] ?? ''));
$streetAddress = trim((string) ($_POST['street_address'] ?? ''));

if (strlen($name) < 2) {
    auth_respond_json(422, ['success' => false, 'message' => 'Please provide a valid name.']);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_respond_json(422, ['success' => false, 'message' => 'Please provide a valid email.']);
}

// Validate password strength
$passwordError = validatePasswordStrength($plainPassword);
if ($passwordError) {
    auth_respond_json(422, ['success' => false, 'message' => $passwordError]);
}

if (strlen($phone) !== 11) {
    auth_respond_json(422, ['success' => false, 'message' => 'Please provide a valid 11-digit phone number.']);
}
if ($region === '' || $province === '' || $municipality === '' || $barangay === '' || $streetAddress === '') {
    auth_respond_json(422, ['success' => false, 'message' => 'Please complete your address details.']);
}

try {
    require_once __DIR__ . '/../../includes/config.php';
    $schema = auth_get_user_schema($conn);
    if ($schema['password'] === null) {
        auth_respond_json(500, ['success' => false, 'message' => 'The users table does not support passwords.']);
    }

    $existing = auth_fetch_user_by_email($conn, $schema, $email);
    if ($existing) {
        auth_respond_json(409, ['success' => false, 'code' => 'EMAIL_EXISTS', 'message' => 'Email is already in users.']);
    }

    // Generate verification code
    $verificationCode = generate_verification_code();

    // Store registration data in session before attempting to send the email.
    // This lets the verification modal open even if SMTP is unavailable in local dev.
    auth_start_session();
    $hashedPassword = password_hash($plainPassword, PASSWORD_DEFAULT);
    $_SESSION['pending_registration'] = [
        'name' => $name,
        'email' => $email,
        'password' => $hashedPassword,
        'phone' => $phone,
        'region' => $region,
        'province' => $province,
        'municipality' => $municipality,
        'barangay' => $barangay,
        'street_address' => $streetAddress,
        'verification_code' => $verificationCode,
        'expires' => time() + (15 * 60) // 15 minutes
    ];

    // Send verification email
    $emailSent = send_verification_email($email, $name, $verificationCode);

    auth_respond_json(200, [
        'success' => true,
        'message' => $emailSent
            ? 'Verification code sent to your email. Please enter the code to complete registration.'
            : 'Verification code could not be sent right now, but the verification step is ready.',
        'requires_verification' => true,
        'email' => $email,
        'email_sent' => $emailSent
    ]);

} catch (Throwable $e) {
    auth_respond_json(500, ['success' => false, 'message' => 'Server error while registering.', 'error' => $e->getMessage()]);
}
