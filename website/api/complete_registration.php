<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    auth_respond_json(405, ['success' => false, 'message' => 'Method not allowed. Use POST.']);
}

$verificationCode = trim((string) ($_POST['code'] ?? ''));

if (strlen($verificationCode) !== 6 || !ctype_digit($verificationCode)) {
    auth_respond_json(422, ['success' => false, 'message' => 'Verification code must be 6 digits.']);
}

try {
    // Start session to check for pending registration
    auth_start_session();

    // Check if there's pending registration data
    $pending = $_SESSION['pending_registration'] ?? null;
    if (!$pending) {
        auth_respond_json(400, ['success' => false, 'message' => 'No pending registration found. Please start the registration process again.']);
    }

    // Check if registration data has expired
    if (time() > ($pending['expires'] ?? 0)) {
        unset($_SESSION['pending_registration']);
        auth_respond_json(400, ['success' => false, 'message' => 'Registration session expired. Please start the registration process again.']);
    }

    // Validate the verification code
    $storedCode = $pending['verification_code'] ?? '';
    if (!hash_equals($storedCode, $verificationCode)) {
        auth_respond_json(401, ['success' => false, 'message' => 'Invalid verification code. Please check your email and try again.']);
    }

    // Code is valid - create the account
    require_once __DIR__ . '/../../includes/config.php';
    $schema = auth_get_user_schema($conn);

    // Double-check email doesn't exist (in case someone registered in the meantime)
    $existing = auth_fetch_user_by_email($conn, $schema, $pending['email']);
    if ($existing) {
        unset($_SESSION['pending_registration']);
        auth_respond_json(409, ['success' => false, 'code' => 'EMAIL_EXISTS', 'message' => 'Email is already registered.']);
    }

    // Create the account
    $columns = ["`{$schema['name']}`", "`{$schema['email']}`", "`{$schema['password']}`"];
    $placeholders = ['?', '?', '?'];
    $types = 'sss';
    $values = [$pending['name'], $pending['email'], $pending['password']];

    $optionalFields = [
        'phone' => 'phone',
        'region' => 'region',
        'province' => 'province',
        'municipality' => 'municipality',
        'barangay' => 'barangay',
        'street_address' => 'street_address',
    ];
    foreach ($optionalFields as $schemaKey => $pendingKey) {
        if (!empty($schema[$schemaKey])) {
            $columns[] = "`{$schema[$schemaKey]}`";
            $placeholders[] = '?';
            $types .= 's';
            $values[] = (string) ($pending[$pendingKey] ?? '');
        }
    }

    if ($schema['status'] !== null) {
        $columns[] = "`{$schema['status']}`";
        $placeholders[] = "'active'";
    }

    // Add verification columns
    $verifyColumns = auth_check_verification_columns($conn);
    if ($verifyColumns['has_is_verified']) {
        $columns[] = "`is_verified`";
        $placeholders[] = "1"; // Already verified
    }

    $sql = "INSERT INTO `users` (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $placeholders) . ")";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        auth_respond_json(500, ['success' => false, 'message' => 'Failed to prepare account creation query.', 'error' => $conn->error]);
    }

    $bindArgs = [$types];
    foreach ($values as $index => $value) {
        $bindArgs[] = &$values[$index];
    }
    if (!call_user_func_array([$stmt, 'bind_param'], $bindArgs)) {
        auth_respond_json(500, ['success' => false, 'message' => 'Failed to bind account creation values.', 'error' => $stmt->error]);
    }
    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();
        auth_respond_json(500, ['success' => false, 'message' => 'Failed to create account.', 'error' => $error]);
    }
    $userId = (int) $stmt->insert_id;
    $stmt->close();

    // Clear the pending registration data
    unset($_SESSION['pending_registration']);

    // Get the created user data
    $created = auth_fetch_user_by_email($conn, $schema, $pending['email']);
    $payload = $created ? auth_build_session_user($created) : [
        'id' => $userId,
        'name' => $pending['name'],
        'email' => $pending['email'],
        'status' => 'active',
        'is_verified' => true,
    ];

    auth_respond_json(200, [
        'success' => true,
        'message' => 'Account created successfully. You can now sign in.',
        'user' => $payload,
    ]);

} catch (Throwable $e) {
    auth_respond_json(500, ['success' => false, 'message' => 'Server error while completing registration.', 'error' => $e->getMessage()]);
}
?>
