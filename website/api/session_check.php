<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

auth_start_session();

$user = $_SESSION['user'] ?? null;
if (!is_array($user) || empty($user['email'])) {
    auth_respond_json(200, ['authenticated' => false, 'user' => null]);
}

try {
    require_once __DIR__ . '/../../includes/config.php';
    $schema = auth_get_user_schema($conn);
    $row = auth_fetch_user_by_email($conn, $schema, (string) $user['email']);

    if (!$row) {
        auth_respond_json(200, ['authenticated' => false, 'user' => null]);
    }

    $freshUser = auth_build_session_user($row);
    $_SESSION['user'] = $freshUser;

    auth_respond_json(200, [
        'authenticated' => true,
        'user' => $freshUser,
    ]);
} catch (Throwable $e) {
    auth_respond_json(500, [
        'authenticated' => false,
        'user' => null,
        'message' => 'Failed to load session.',
        'error' => $e->getMessage(),
    ]);
}
