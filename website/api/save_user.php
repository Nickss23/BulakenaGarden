<?php
header('Content-Type: application/json');
mysqli_report(MYSQLI_REPORT_OFF);

require_once __DIR__ . '/../../includes/auth_common.php';

function respond_json(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_json(405, [
        'success' => false,
        'message' => 'Method not allowed. Use POST.'
    ]);
}

$name = trim((string)($_POST['name'] ?? ''));
$email = strtolower(trim((string)($_POST['email'] ?? '')));
$password = (string)($_POST['password'] ?? '');
$phone = preg_replace('/\D+/', '', (string)($_POST['phone'] ?? ''));
$id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
$status = trim((string)($_POST['status'] ?? ''));
$rejectIfExists = ((string)($_POST['reject_if_exists'] ?? '0')) === '1';
$isStatusUpdate = $id > 0 && $status !== '';

// sanitize name: remove accidental 'Users' label or 'orders' text that may come
// from client localStorage dumps or UI artifacts. Case-insensitive.
$name = preg_replace('/\b(users|orders)\b/i', '', $name);
$name = trim(preg_replace('/\s+/', ' ', $name));

if (!$isStatusUpdate && ($name === '' || strlen($name) < 2)) {
    respond_json(422, [
        'success' => false,
        'message' => 'A valid name is required.'
    ]);
}

if (!$isStatusUpdate && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond_json(422, [
        'success' => false,
        'message' => 'A valid email is required.'
    ]);
}

if ($password !== '') {
    $password = auth_hash_password_if_needed($password);
}

try {
    require_once __DIR__ . '/../../includes/config.php';

    $result = $conn->query("SHOW COLUMNS FROM `users`");
    if (!$result instanceof mysqli_result) {
        respond_json(500, [
            'success' => false,
            'message' => 'Failed to inspect users table.',
            'error' => $conn->error
        ]);
    }

    $columns = [];
    while ($row = $result->fetch_assoc()) {
        $columns[] = strtolower((string)$row['Field']);
    }
    $result->free();

    $pick = function (array $candidates) use ($columns): ?string {
        foreach ($candidates as $candidate) {
            if (in_array($candidate, $columns, true)) {
                return $candidate;
            }
        }
        return null;
    };

    $nameColumn = $pick(['name', 'full_name', 'fullname', 'username', 'user_name']);
    $emailColumn = $pick(['email', 'user_email']);
    $passwordColumn = $pick(['password', 'pass', 'user_password']);
    $ordersColumn = $pick(['orders']);
    $statusColumn = $pick(['status', 'user_status']);
    $phoneColumn = $pick(['phone', 'mobile', 'contact_number', 'phone_number']);
    $regionColumn = $pick(['region']);
    $provinceColumn = $pick(['province']);
    $municipalityColumn = $pick(['municipality', 'city']);
    $barangayColumn = $pick(['barangay']);
    $streetTypeColumn = $pick(['street_type', 'streettype']);
    $streetAddressColumn = $pick(['street_address', 'address', 'street', 'address_line', 'street_name']);

    if ($nameColumn === null || $emailColumn === null) {
        respond_json(500, [
            'success' => false,
            'message' => 'The users table is missing a supported name/email column.',
            'available_columns' => $columns
        ]);
    }

    if ($isStatusUpdate) {
        if ($statusColumn === null) {
            respond_json(422, [
                'success' => false,
                'message' => 'The users table does not support status updates.'
            ]);
        }

        $stmt = $conn->prepare("UPDATE `users` SET `$statusColumn` = ? WHERE id = ?");
        if (!$stmt) {
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to prepare status update.',
                'error' => $conn->error
            ]);
        }
        $stmt->bind_param('si', $status, $id);
        if (!$stmt->execute()) {
            $error = $stmt->error;
            $stmt->close();
            $conn->close();
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to update user status.',
                'error' => $error
            ]);
        }
        $stmt->close();
        $conn->close();

        respond_json(200, [
            'success' => true,
            'message' => 'User status updated.'
        ]);
    }

    if ($rejectIfExists) {
        $checkSql = "SELECT 1 FROM `users` WHERE `$emailColumn` = ? LIMIT 1";
        $checkStmt = $conn->prepare($checkSql);
        if (!$checkStmt) {
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to prepare duplicate check query.',
                'error' => $conn->error
            ]);
        }

        $checkStmt->bind_param('s', $email);
        if (!$checkStmt->execute()) {
            $error = $checkStmt->error;
            $checkStmt->close();
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to check existing email.',
                'error' => $error
            ]);
        }

        $checkResult = $checkStmt->get_result();
        $emailExists = $checkResult instanceof mysqli_result && $checkResult->num_rows > 0;
        if ($checkResult instanceof mysqli_result) {
            $checkResult->free();
        }
        $checkStmt->close();

        if ($emailExists) {
            respond_json(409, [
                'success' => false,
                'code' => 'EMAIL_EXISTS',
                'message' => 'Email is already in users.'
            ]);
        }
    }

    $profileValues = [
        'phone' => $phone,
        'region' => trim((string) ($_POST['region'] ?? '')),
        'province' => trim((string) ($_POST['province'] ?? '')),
        'municipality' => trim((string) ($_POST['municipality'] ?? '')),
        'barangay' => trim((string) ($_POST['barangay'] ?? '')),
        'street_type' => trim((string) ($_POST['street_type'] ?? '')),
        'street_address' => trim((string) ($_POST['street_address'] ?? '')),
    ];
    $profileColumns = [
        'phone' => $phoneColumn,
        'region' => $regionColumn,
        'province' => $provinceColumn,
        'municipality' => $municipalityColumn,
        'barangay' => $barangayColumn,
        'street_type' => $streetTypeColumn,
        'street_address' => $streetAddressColumn,
    ];

    if ($id > 0) {
        $checkSql = "SELECT `id` FROM `users` WHERE `$emailColumn` = ? AND `id` <> ? LIMIT 1";
        $checkStmt = $conn->prepare($checkSql);
        if (!$checkStmt) {
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to prepare duplicate email check.',
                'error' => $conn->error
            ]);
        }
        $checkStmt->bind_param('si', $email, $id);
        if (!$checkStmt->execute()) {
            $error = $checkStmt->error;
            $checkStmt->close();
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to check existing email.',
                'error' => $error
            ]);
        }
        $checkResult = $checkStmt->get_result();
        $emailTaken = $checkResult instanceof mysqli_result && $checkResult->num_rows > 0;
        if ($checkResult instanceof mysqli_result) {
            $checkResult->free();
        }
        $checkStmt->close();
        if ($emailTaken) {
            respond_json(409, [
                'success' => false,
                'code' => 'EMAIL_EXISTS',
                'message' => 'Email is already registered.'
            ]);
        }

        $updateParts = ["`$nameColumn` = ?", "`$emailColumn` = ?"];
        $types = 'ss';
        $values = [$name, $email];
        if ($passwordColumn !== null && $password !== '') {
            $updateParts[] = "`$passwordColumn` = ?";
            $types .= 's';
            $values[] = $password;
        }
        foreach ($profileColumns as $key => $columnName) {
            if ($columnName === null) {
                continue;
            }
            $updateParts[] = "`$columnName` = ?";
            $types .= 's';
            $values[] = $profileValues[$key] ?? '';
        }
        $types .= 'i';
        $values[] = $id;

        $stmt = $conn->prepare("UPDATE `users` SET " . implode(', ', $updateParts) . " WHERE `id` = ? LIMIT 1");
        if (!$stmt) {
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to prepare account update.',
                'error' => $conn->error
            ]);
        }
        $bindArgs = [$types];
        foreach ($values as $index => $value) {
            $bindArgs[] = &$values[$index];
        }
        if (!call_user_func_array([$stmt, 'bind_param'], $bindArgs)) {
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to bind account update values.',
                'error' => $stmt->error
            ]);
        }
        if (!$stmt->execute()) {
            $error = $stmt->error;
            $stmt->close();
            $conn->close();
            respond_json(500, [
                'success' => false,
                'message' => 'Failed to update account.',
                'error' => $error
            ]);
        }
        $affected = $stmt->affected_rows;
        $stmt->close();

        auth_start_session();
        $sessionUser = $_SESSION['user'] ?? null;
        if (is_array($sessionUser) && (int)($sessionUser['id'] ?? 0) === $id) {
            $_SESSION['user']['name'] = $name;
            $_SESSION['user']['email'] = $email;
            foreach ($profileValues as $key => $value) {
                $_SESSION['user'][$key] = $value;
            }
        }

        $conn->close();
        respond_json(200, [
            'success' => true,
            'message' => 'Account updated.',
            'affected' => $affected
        ]);
    }

    $insertColumns = ["`$nameColumn`", "`$emailColumn`"];
    $placeholders = ['?', '?'];
    $types = 'ss';
    $values = [$name, $email];
    $updateParts = ["`$nameColumn` = VALUES(`$nameColumn`)"];

    if ($passwordColumn !== null) {
        $insertColumns[] = "`$passwordColumn`";
        $placeholders[] = '?';
        $types .= 's';
        $values[] = $password;
        $updateParts[] = "`$passwordColumn` = COALESCE(NULLIF(VALUES(`$passwordColumn`), ''), `$passwordColumn`)";
    }

    foreach ($profileColumns as $key => $columnName) {
        if ($columnName === null) {
            continue;
        }
        $value = $profileValues[$key] ?? '';
        if ($value === '') {
            continue;
        }
        $insertColumns[] = "`$columnName`";
        $placeholders[] = '?';
        $types .= 's';
        $values[] = $value;
        $updateParts[] = "`$columnName` = VALUES(`$columnName`)";
    }

    if ($ordersColumn !== null) {
        $insertColumns[] = "`$ordersColumn`";
        $placeholders[] = "''";
        $updateParts[] = "`$ordersColumn` = ''";
    }

    $sql = "
        INSERT INTO `users` (" . implode(', ', $insertColumns) . ")
        VALUES (" . implode(', ', $placeholders) . ")
        ON DUPLICATE KEY UPDATE
            " . implode(",\n            ", $updateParts) . "
    ";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        respond_json(500, [
            'success' => false,
            'message' => 'Failed to prepare query.',
            'error' => $conn->error
        ]);
    }
    $bindArgs = [$types];
    foreach ($values as $index => $value) {
        $bindArgs[] = &$values[$index];
    }
    if (!call_user_func_array([$stmt, 'bind_param'], $bindArgs)) {
        respond_json(500, [
            'success' => false,
            'message' => 'Failed to bind query values.',
            'error' => $stmt->error
        ]);
    }

    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();
        $conn->close();
        respond_json(500, [
            'success' => false,
            'message' => 'Failed to save user.',
            'error' => $error
        ]);
    }

    $stmt->close();
    $conn->close();

    respond_json(200, [
        'success' => true,
        'message' => 'User saved to database.'
    ]);
} catch (Throwable $e) {
    respond_json(500, [
        'success' => false,
        'message' => 'Server error while saving user.',
        'error' => $e->getMessage()
    ]);
}
