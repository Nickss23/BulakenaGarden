<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
auth_require_admin_page('../../website/index.html');

header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/../admin.html');
