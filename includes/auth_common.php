<?php
declare(strict_types=1);

function auth_respond_json(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function auth_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $sessionDir = __DIR__ . '/../data/sessions';
    if (!is_dir($sessionDir)) {
        @mkdir($sessionDir, 0775, true);
    }
    if (is_dir($sessionDir) && is_writable($sessionDir)) {
        session_save_path($sessionDir);
    }

    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);

    session_start();
}

function auth_start_named_session(string $sessionName): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        if (session_name() === $sessionName) {
            return;
        }
        session_write_close();
    }

    session_name($sessionName);
    auth_start_session();
}

function auth_start_admin_session(): void
{
    auth_start_named_session('BULAKENA_ADMINSESSID');
}

function auth_admin_login(): string
{
    return 'admin';
}

function auth_admin_password(): string
{
    return 'admin123';
}

function auth_is_admin_identifier(string $value): bool
{
    return strtolower(trim($value)) === auth_admin_login();
}

function auth_is_admin_credentials(string $identifier, string $password): bool
{
    return auth_is_admin_identifier($identifier) && hash_equals(auth_admin_password(), $password);
}

function auth_build_admin_session_user(): array
{
    return [
        'id' => 0,
        'name' => 'Admin',
        'email' => auth_admin_login(),
        'status' => 'active',
        'is_admin' => true,
    ];
}

function auth_session_is_admin(): bool
{
    auth_start_admin_session();
    $user = $_SESSION['admin_user'] ?? null;
    return is_array($user) && !empty($user['is_admin']);
}

function auth_require_admin_json(): void
{
    if (!auth_session_is_admin()) {
        auth_respond_json(403, ['success' => false, 'message' => 'Admin access required.']);
    }
}

function auth_configured_app_api_key(): string
{
    foreach ([
        defined('BULAKENA_APP_API_KEY') ? BULAKENA_APP_API_KEY : null,
        getenv('BULAKENA_APP_API_KEY'),
        $_ENV['BULAKENA_APP_API_KEY'] ?? null,
        $_SERVER['BULAKENA_APP_API_KEY'] ?? null,
    ] as $candidate) {
        if (is_string($candidate) && trim($candidate) !== '') {
            return trim($candidate);
        }
    }

    return '';
}

function auth_request_app_api_key(): string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $name => $value) {
        if (strtolower((string)$name) === 'x-bulakena-app-key') {
            return trim((string)$value);
        }
        if (strtolower((string)$name) === 'authorization') {
            $authorization = trim((string)$value);
            if (stripos($authorization, 'Bearer ') === 0) {
                return trim(substr($authorization, 7));
            }
        }
    }

    if (!empty($_SERVER['HTTP_X_BULAKENA_APP_KEY'])) {
        return trim((string)$_SERVER['HTTP_X_BULAKENA_APP_KEY']);
    }

    $authorization = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if (stripos($authorization, 'Bearer ') === 0) {
        return trim(substr($authorization, 7));
    }

    return trim((string)($_POST['app_key'] ?? $_GET['app_key'] ?? ''));
}

function auth_request_has_valid_app_api_key(): bool
{
    $configuredKey = auth_configured_app_api_key();
    $requestKey = auth_request_app_api_key();
    return $configuredKey !== '' && $requestKey !== '' && hash_equals($configuredKey, $requestKey);
}

function auth_require_admin_or_app_json(): void
{
    if (auth_request_has_valid_app_api_key()) {
        return;
    }

    auth_require_admin_json();
}

function auth_require_admin_page(string $redirectTo = 'index.html'): void
{
    if (auth_session_is_admin()) {
        return;
    }

    header('Location: ' . $redirectTo, true, 302);
    exit;
}

function auth_normalize_email(string $email): string
{
    return strtolower(trim($email));
}

function auth_is_password_hash(string $value): bool
{
    return $value !== '' && password_get_info($value)['algo'] !== null;
}

function auth_hash_password_if_needed(string $password): string
{
    if ($password === '') {
        return '';
    }
    if (auth_is_password_hash($password)) {
        return $password;
    }
    return password_hash($password, PASSWORD_BCRYPT);
}

function auth_verify_password(string $plainPassword, string $storedPassword): bool
{
    if ($plainPassword === '' || $storedPassword === '') {
        return false;
    }
    if (auth_is_password_hash($storedPassword)) {
        return password_verify($plainPassword, $storedPassword);
    }
    return hash_equals($storedPassword, $plainPassword);
}

function auth_needs_rehash_or_upgrade(string $storedPassword): bool
{
    if ($storedPassword === '') {
        return false;
    }
    if (!auth_is_password_hash($storedPassword)) {
        return true;
    }
    return password_needs_rehash($storedPassword, PASSWORD_BCRYPT);
}

function auth_pick_column(array $columns, array $candidates): ?string
{
    foreach ($candidates as $candidate) {
        if (in_array($candidate, $columns, true)) {
            return $candidate;
        }
    }
    return null;
}

function auth_get_user_schema(mysqli $conn): array
{
    $result = $conn->query("SHOW COLUMNS FROM `users`");
    if (!$result instanceof mysqli_result) {
        throw new RuntimeException('Failed to inspect users table: ' . $conn->error);
    }

    $columns = [];
    while ($row = $result->fetch_assoc()) {
        $columns[] = strtolower((string) ($row['Field'] ?? ''));
    }
    $result->free();

    $schema = [
        'name' => auth_pick_column($columns, ['name', 'full_name', 'fullname', 'username', 'user_name']),
        'email' => auth_pick_column($columns, ['email', 'user_email']),
        'password' => auth_pick_column($columns, ['password', 'pass', 'user_password']),
        'status' => auth_pick_column($columns, ['status', 'user_status']),
        'created_at' => auth_pick_column($columns, ['created_at', 'createdon', 'created']),
        'phone' => auth_pick_column($columns, ['phone', 'mobile', 'contact_number', 'phone_number']),
        'region' => auth_pick_column($columns, ['region']),
        'province' => auth_pick_column($columns, ['province']),
        'municipality' => auth_pick_column($columns, ['municipality', 'city']),
        'barangay' => auth_pick_column($columns, ['barangay']),
        'street_type' => auth_pick_column($columns, ['street_type', 'streettype']),
        'street_address' => auth_pick_column($columns, ['street_address', 'address', 'street', 'address_line', 'street_name']),
    ];

    if ($schema['name'] === null || $schema['email'] === null) {
        throw new RuntimeException('The users table is missing a supported name/email column.');
    }

    return $schema;
}

function auth_fetch_user_by_email(mysqli $conn, array $schema, string $email): ?array
{
    $select = [
        "id",
        "`{$schema['name']}` AS full_name",
        "`{$schema['email']}` AS email",
    ];
    if ($schema['password'] !== null) {
        $select[] = "`{$schema['password']}` AS password_hash";
    }
    if ($schema['status'] !== null) {
        $select[] = "`{$schema['status']}` AS status";
    }
    if ($schema['phone'] !== null) {
        $select[] = "`{$schema['phone']}` AS phone";
    }
    if ($schema['region'] !== null) {
        $select[] = "`{$schema['region']}` AS region";
    }
    if ($schema['province'] !== null) {
        $select[] = "`{$schema['province']}` AS province";
    }
    if ($schema['municipality'] !== null) {
        $select[] = "`{$schema['municipality']}` AS municipality";
    }
    if ($schema['barangay'] !== null) {
        $select[] = "`{$schema['barangay']}` AS barangay";
    }
    if ($schema['street_type'] !== null) {
        $select[] = "`{$schema['street_type']}` AS street_type";
    }
    if ($schema['street_address'] !== null) {
        $select[] = "`{$schema['street_address']}` AS street_address";
    }

    $sql = "SELECT " . implode(', ', $select) . " FROM `users` WHERE `{$schema['email']}` = ? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('Failed to prepare user lookup: ' . $conn->error);
    }
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result instanceof mysqli_result ? $result->fetch_assoc() : null;
    if ($result instanceof mysqli_result) {
        $result->free();
    }
    $stmt->close();

    return is_array($row) ? $row : null;
}

function auth_build_session_user(array $row): array
{
    $user = [
        'id' => isset($row['id']) ? (int) $row['id'] : 0,
        'name' => (string) ($row['full_name'] ?? $row['name'] ?? ''),
        'email' => auth_normalize_email((string) ($row['email'] ?? '')),
        'status' => (string) ($row['status'] ?? 'active'),
        'is_verified' => isset($row['is_verified']) ? (bool) $row['is_verified'] : true,
        'is_admin' => false,
    ];

    foreach (['phone', 'region', 'province', 'municipality', 'barangay', 'street_type', 'street_address'] as $field) {
        if (array_key_exists($field, $row)) {
          $user[$field] = (string) $row[$field];
        }
    }

    return $user;
}

/**
 * Check if users table has verification columns
 * @return array Array with keys: has_verification_code, has_is_verified, has_verification_sent_at
 */
function auth_check_verification_columns(mysqli $conn): array
{
    $result = $conn->query("SHOW COLUMNS FROM `users`");
    if (!$result instanceof mysqli_result) {
        return ['has_verification_code' => false, 'has_is_verified' => false, 'has_verification_sent_at' => false];
    }

    $columns = [];
    while ($row = $result->fetch_assoc()) {
        $columns[] = strtolower((string) ($row['Field'] ?? ''));
    }
    $result->free();

    return [
        'has_verification_code' => in_array('verification_code', $columns, true),
        'has_is_verified' => in_array('is_verified', $columns, true),
        'has_verification_sent_at' => in_array('verification_sent_at', $columns, true),
    ];
}

/**
 * Fetch user by email with verification info
 * @return array|null User row with verification details or null
 */
function auth_fetch_user_by_email_with_verification(mysqli $conn, array $schema, string $email): ?array
{
    $verifyColumns = auth_check_verification_columns($conn);
    
    $select = [
        "id",
        "`{$schema['name']}` AS full_name",
        "`{$schema['email']}` AS email",
    ];
    if ($schema['password'] !== null) {
        $select[] = "`{$schema['password']}` AS password_hash";
    }
    if ($schema['status'] !== null) {
        $select[] = "`{$schema['status']}` AS status";
    }
    if ($verifyColumns['has_is_verified']) {
        $select[] = "`is_verified` AS is_verified";
    }
    if ($verifyColumns['has_verification_code']) {
        $select[] = "`verification_code` AS verification_code";
    }
    if ($verifyColumns['has_verification_sent_at']) {
        $select[] = "`verification_sent_at` AS verification_sent_at";
    }

    $sql = "SELECT " . implode(', ', $select) . " FROM `users` WHERE `{$schema['email']}` = ? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('Failed to prepare user lookup: ' . $conn->error);
    }
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result instanceof mysqli_result ? $result->fetch_assoc() : null;
    if ($result instanceof mysqli_result) {
        $result->free();
    }
    $stmt->close();

    return is_array($row) ? $row : null;
}

/**
 * Save verification code for a user
 * @return bool True if successful, false otherwise
 */
function auth_save_verification_code(mysqli $conn, int $userId, string $verificationCode): bool
{
    $stmt = $conn->prepare("UPDATE `users` SET `verification_code` = ?, `verification_sent_at` = NOW(), `is_verified` = 0 WHERE `id` = ?");
    if (!$stmt) {
        return false;
    }
    
    $stmt->bind_param('si', $verificationCode, $userId);
    $result = $stmt->execute();
    $stmt->close();
    
    return $result;
}

/**
 * Verify a user's email with verification code
 * @return bool True if verified successfully, false otherwise
 */
function auth_verify_email_code(mysqli $conn, int $userId, string $providedCode): bool
{
    // Get the user and their stored code
    $stmt = $conn->prepare("SELECT `verification_code`, `verification_sent_at` FROM `users` WHERE `id` = ? LIMIT 1");
    if (!$stmt) {
        return false;
    }
    
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result instanceof mysqli_result ? $result->fetch_assoc() : null;
    if ($result instanceof mysqli_result) {
        $result->free();
    }
    $stmt->close();
    
    if (!is_array($row)) {
        return false;
    }
    
    $storedCode = (string) ($row['verification_code'] ?? '');
    $sentAt = (string) ($row['verification_sent_at'] ?? '');
    
    // Check if code matches
    if (!hash_equals($storedCode, $providedCode)) {
        return false;
    }
    
    // Check if code has expired (15 minutes)
    if ($sentAt) {
        $sentTime = strtotime($sentAt);
        $currentTime = time();
        $expiryTime = 15 * 60; // 15 minutes in seconds
        
        if ($currentTime - $sentTime > $expiryTime) {
            return false;
        }
    }
    
    // Mark as verified
    $stmt = $conn->prepare("UPDATE `users` SET `is_verified` = 1, `verification_code` = NULL WHERE `id` = ?");
    if (!$stmt) {
        return false;
    }
    
    $stmt->bind_param('i', $userId);
    $result = $stmt->execute();
    $stmt->close();
    
    return $result;
}
