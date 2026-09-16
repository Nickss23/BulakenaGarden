<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

auth_start_session();

$sessionUser = $_SESSION['user'] ?? null;
if (!is_array($sessionUser) || empty($sessionUser['email'])) {
    auth_respond_json(200, ['authenticated' => false, 'user' => null]);
}

try {
    require_once __DIR__ . '/../../includes/config.php';
    $schema = auth_get_user_schema($conn);
    $row = auth_fetch_user_by_email($conn, $schema, (string) $sessionUser['email']);

    if (!$row) {
        auth_respond_json(200, ['authenticated' => false, 'user' => null]);
    }

    auth_respond_json(200, [
        'authenticated' => true,
        'user' => auth_build_session_user($row),
    ]);
} catch (Throwable $e) {
    auth_respond_json(500, [
        'authenticated' => false,
        'user' => null,
        'message' => 'Failed to load profile.',
        'error' => $e->getMessage(),
    ]);
}
