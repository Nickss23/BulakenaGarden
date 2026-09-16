<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
auth_require_admin_json();

// Development: show errors to help debug 500 responses
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

function hasTable(mysqli $conn, string $table): bool
{
    $safeTable = $conn->real_escape_string($table);
    $result = $conn->query("SHOW TABLES LIKE '{$safeTable}'");
    if ($result instanceof mysqli_result) {
        $exists = $result->num_rows > 0;
        $result->free();
        return $exists;
    }
    return false;
}

try {
    require_once __DIR__ . '/../../includes/config.php';

    if (!isset($conn) || !($conn instanceof mysqli)) {
        throw new Exception('Database connection not available (check config.php).');
    }

    // Inspect available columns and map to expected output
    $colsRes = $conn->query("SHOW COLUMNS FROM `users`");
    if ($colsRes === false) throw new Exception('Failed to inspect users table: ' . $conn->error);
    $cols = [];
    while ($c = $colsRes->fetch_assoc()) $cols[] = $c['Field'];
    $colsRes->free();

    // Determine which name/email/password/status/created columns exist
    $pick = function($candidates) use ($cols) {
        foreach ($candidates as $c) if (in_array($c, $cols)) return $c;
        return null;
    };

    $nameCol = $pick(['full_name','fullname','name','username','user_name']);
    $emailCol = $pick(['email','user_email']);
    $passwordCol = $pick(['password','pass','user_password']);
    $statusCol = $pick(['status','user_status']);
    $createdCol = $pick(['created_at','created','createdAt','created_on']);
    $totalOrdersCol = $pick(['total_orders']);
    $regionCol = $pick(['region']);
    $provinceCol = $pick(['province']);
    $municipalityCol = $pick(['municipality','city']);
    $barangayCol = $pick(['barangay']);
    $streetTypeCol = $pick(['street_type','streettype']);
    $streetAddressCol = $pick(['street_address','address','street','address_line','street_name']);

    // Build select list
    $select = ['id'];
    if ($nameCol) $select[] = "$nameCol AS full_name";
    if ($emailCol) $select[] = $emailCol;
    if ($totalOrdersCol) $select[] = "{$totalOrdersCol} AS total_orders";
    if ($passwordCol) $select[] = $passwordCol;
    if ($statusCol) $select[] = $statusCol;
    if ($createdCol) $select[] = $createdCol;
    if ($regionCol) $select[] = "{$regionCol} AS region";
    if ($provinceCol) $select[] = "{$provinceCol} AS province";
    if ($municipalityCol) $select[] = "{$municipalityCol} AS municipality";
    if ($barangayCol) $select[] = "{$barangayCol} AS barangay";
    if ($streetTypeCol) $select[] = "{$streetTypeCol} AS street_type";
    if ($streetAddressCol) $select[] = "{$streetAddressCol} AS street_address";

    $selectSql = implode(', ', $select);

    // If id provided, return single user
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];
        $stmt = $conn->prepare("SELECT $selectSql FROM `users` WHERE id = ? LIMIT 1");
        if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);
        $stmt->bind_param('i', $id);
        if (!$stmt->execute()) throw new Exception('Execute failed: ' . $stmt->error);
        $res = $stmt->get_result();
        $row = $res ? $res->fetch_assoc() : null;
        echo json_encode($row ?: new stdClass());
        if ($res) $res->free();
        $stmt->close();
        $conn->close();
        exit;
    }

    $sql = "SELECT $selectSql FROM `users` ORDER BY " . ($createdCol ? $createdCol . ' DESC' : 'id DESC');
    $result = $conn->query($sql);
    if ($result === false) throw new Exception('Query error: ' . $conn->error);

    $rows = [];
    while ($r = $result->fetch_assoc()) $rows[] = $r;
    $result->free();

    if ($emailCol && !empty($rows)) {
        $orderCounts = [];

        if (hasTable($conn, 'orders')) {
            $countsRes = $conn->query("SELECT customer_email, COUNT(*) AS total_orders FROM `orders` GROUP BY customer_email");
            if ($countsRes instanceof mysqli_result) {
                while ($countRow = $countsRes->fetch_assoc()) {
                    $emailKey = strtolower(trim((string)($countRow['customer_email'] ?? '')));
                    if ($emailKey !== '') $orderCounts[$emailKey] = (int)($countRow['total_orders'] ?? 0);
                }
                $countsRes->free();
            }
        } else {
            $ordersDir = __DIR__ . '/../../orders/';
            if (is_dir($ordersDir)) {
                $files = glob($ordersDir . '*.json');
                if (is_array($files)) {
                    foreach ($files as $file) {
                        $json = @file_get_contents($file);
                        if (!$json) continue;
                        $obj = json_decode($json, true);
                        if (!is_array($obj)) continue;
                        $customerEmail = strtolower(trim((string)($obj['customer']['email'] ?? '')));
                        if ($customerEmail === '') continue;
                        $orderCounts[$customerEmail] = ($orderCounts[$customerEmail] ?? 0) + 1;
                    }
                }
            }
        }

        foreach ($rows as &$row) {
            $userEmail = strtolower(trim((string)($row[$emailCol] ?? $row['email'] ?? '')));
            $computedOrders = $userEmail !== '' ? (int)($orderCounts[$userEmail] ?? 0) : 0;
            $row['total_orders'] = $computedOrders;

            if ($totalOrdersCol && isset($row['id']) && (int)$row['id'] > 0) {
                $userId = (int)$row['id'];
                $sqlUpdate = "UPDATE `users` SET `{$totalOrdersCol}` = {$computedOrders} WHERE id = {$userId}";
                if ($conn->query($sqlUpdate) === false) {
                    error_log('get_users.php failed to sync total_orders for user id ' . $userId . ': ' . $conn->error);
                }
            }
        }
        unset($row);
    }

    echo json_encode($rows);
    $conn->close();

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
}

?>
