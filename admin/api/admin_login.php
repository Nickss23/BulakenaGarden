<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    auth_respond_json(405, ['success' => false, 'message' => 'Method not allowed. Use POST.']);
}

$identifier = auth_normalize_email((string) ($_POST['email'] ?? ''));
$plainPassword = (string) ($_POST['password'] ?? '');

if (!auth_is_admin_credentials($identifier, $plainPassword)) {
    auth_respond_json(401, ['success' => false, 'message' => 'Invalid admin credentials.']);
}

auth_start_admin_session();
session_regenerate_id(true);
$_SESSION['admin_user'] = auth_build_admin_session_user();

auth_respond_json(200, [
    'success' => true,
    'message' => 'Admin login successful.',
    'user' => $_SESSION['admin_user'],
]);
