<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

auth_start_admin_session();

$user = $_SESSION['admin_user'] ?? null;
if (!is_array($user) || empty($user['is_admin'])) {
    auth_respond_json(200, ['authenticated' => false, 'user' => null]);
}

auth_respond_json(200, [
    'authenticated' => true,
    'user' => [
        'id' => (int) ($user['id'] ?? 0),
        'name' => (string) ($user['name'] ?? ''),
        'email' => (string) ($user['email'] ?? ''),
        'status' => (string) ($user['status'] ?? 'active'),
        'is_admin' => true,
    ],
]);
