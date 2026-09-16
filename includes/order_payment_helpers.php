<?php
declare(strict_types=1);

function bg_pending_payment_dir(): string
{
    return __DIR__ . '/../data/pending_payments';
}

function bg_safe_ref(string $value): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_-]+/', '_', $value);
    return trim((string)$safe, '_') ?: 'payment';
}

function bg_is_customer_order_ref(string $value): bool
{
    return preg_match('/^BGGO-\d{8}-\d{4}-\d{3}$/', trim($value)) === 1;
}

function bg_order_ref_timezone(): DateTimeZone
{
    return new DateTimeZone('Asia/Singapore');
}

function bg_order_ref_period(?DateTimeInterface $now = null): string
{
    $localNow = $now
        ? DateTimeImmutable::createFromInterface($now)->setTimezone(bg_order_ref_timezone())
        : new DateTimeImmutable('now', bg_order_ref_timezone());

    return $localNow->format('YmdHi');
}

function bg_format_customer_order_ref(string $period, int $sequence): string
{
    if ($sequence > 999) {
        throw new RuntimeException('Order sequence exceeded 999 for the current day.');
    }

    return 'BGGO-' . substr($period, 0, 8) . '-' . substr($period, 8, 4) . '-' . str_pad((string)$sequence, 3, '0', STR_PAD_LEFT);
}

function bg_order_ref_sequence_period(string $displayPeriod): string
{
    return substr($displayPeriod, 0, 8);
}

function bg_pending_order_ref_sequence(string $sequencePeriod): int
{
    $dir = bg_pending_payment_dir();
    if (!is_dir($dir)) {
        return 0;
    }

    $max = 0;
    $pattern = '/BGGO-' . preg_quote($sequencePeriod, '/') . '-\d{4}-(\d{3})/';
    foreach (glob($dir . '/*.json') ?: [] as $file) {
        $name = basename((string)$file);
        if (preg_match($pattern, $name, $matches) === 1) {
            $max = max($max, (int)$matches[1]);
            continue;
        }

        $contents = @file_get_contents((string)$file);
        if (is_string($contents) && preg_match($pattern, $contents, $matches) === 1) {
            $max = max($max, (int)$matches[1]);
        }
    }

    return $max;
}

function bg_existing_order_ref_sequence(mysqli $conn, string $sequencePeriod): int
{
    $prefix = 'BGGO-' . $sequencePeriod . '-';
    $stmt = $conn->prepare(
        "SELECT MAX(CAST(RIGHT(`order_ref`, 3) AS UNSIGNED)) AS max_seq
         FROM `orders`
         WHERE `order_ref` LIKE CONCAT(?, '%')"
    );
    if (!$stmt) {
        return 0;
    }

    $stmt->bind_param('s', $prefix);
    $stmt->execute();
    $res = method_exists($stmt, 'get_result') ? $stmt->get_result() : null;
    $row = $res instanceof mysqli_result ? $res->fetch_assoc() : null;
    if ($res instanceof mysqli_result) {
        $res->free();
    }
    $stmt->close();

    return is_array($row) ? max(0, (int)($row['max_seq'] ?? 0)) : 0;
}

function bg_generate_customer_order_ref(?mysqli $conn = null, ?DateTimeInterface $now = null): string
{
    $displayPeriod = bg_order_ref_period($now);
    $sequencePeriod = bg_order_ref_sequence_period($displayPeriod);

    if ($conn instanceof mysqli && !$conn->connect_error) {
        $conn->query(
            "CREATE TABLE IF NOT EXISTS `order_ref_sequences` (
                `period_key` CHAR(12) NOT NULL,
                `last_number` INT UNSIGNED NOT NULL DEFAULT 0,
                `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`period_key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        try {
            $conn->begin_transaction();
            $existingMax = max(
                bg_existing_order_ref_sequence($conn, $sequencePeriod),
                bg_pending_order_ref_sequence($sequencePeriod)
            );
            $current = 0;
            $hasSequenceRow = false;

            $stmt = $conn->prepare("SELECT `last_number` FROM `order_ref_sequences` WHERE `period_key` = ? FOR UPDATE");
            if ($stmt) {
                $stmt->bind_param('s', $sequencePeriod);
                $stmt->execute();
                $res = method_exists($stmt, 'get_result') ? $stmt->get_result() : null;
                $row = $res instanceof mysqli_result ? $res->fetch_assoc() : null;
                if ($res instanceof mysqli_result) {
                    $res->free();
                }
                $stmt->close();
                $hasSequenceRow = is_array($row);
                $current = $hasSequenceRow ? (int)($row['last_number'] ?? 0) : 0;
            }

            $next = max($current, $existingMax) + 1;
            if ($next > 999) {
                $conn->rollback();
                throw new RuntimeException('Order sequence exceeded 999 for the current day.');
            }

            if ($hasSequenceRow) {
                $stmt = $conn->prepare("UPDATE `order_ref_sequences` SET `last_number` = ? WHERE `period_key` = ?");
                if ($stmt) {
                    $stmt->bind_param('is', $next, $sequencePeriod);
                    $stmt->execute();
                    $stmt->close();
                }
            } else {
                $stmt = $conn->prepare("INSERT INTO `order_ref_sequences` (`period_key`, `last_number`) VALUES (?, ?)");
                if ($stmt) {
                    $stmt->bind_param('si', $sequencePeriod, $next);
                    $stmt->execute();
                    $stmt->close();
                }
            }

            $conn->commit();
            return bg_format_customer_order_ref($displayPeriod, $next);
        } catch (Throwable $e) {
            try {
                $conn->rollback();
            } catch (Throwable $rollbackError) {
                error_log('Could not roll back order ref sequence transaction: ' . $rollbackError->getMessage());
            }
            error_log('Database order ref generation failed: ' . $e->getMessage());
        }
    }

    $dir = __DIR__ . '/../data/order_ref_sequences';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $file = $dir . '/' . $sequencePeriod . '.txt';
    $handle = fopen($file, 'c+');
    if (!$handle) {
        $next = bg_pending_order_ref_sequence($sequencePeriod) + 1;
        return bg_format_customer_order_ref($displayPeriod, $next);
    }

    try {
        flock($handle, LOCK_EX);
        $contents = trim((string)stream_get_contents($handle));
        $next = max(0, (int)$contents, bg_pending_order_ref_sequence($sequencePeriod)) + 1;
        if ($next > 999) {
            throw new RuntimeException('Order sequence exceeded 999 for the current day.');
        }
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, (string)$next);
        fflush($handle);
        flock($handle, LOCK_UN);
        return bg_format_customer_order_ref($displayPeriod, $next);
    } finally {
        fclose($handle);
    }
}

function bg_customer_order_ref_or_new(string $incomingOrderRef = '', ?mysqli $conn = null): string
{
    $incomingOrderRef = trim($incomingOrderRef);
    return bg_is_customer_order_ref($incomingOrderRef)
        ? $incomingOrderRef
        : bg_generate_customer_order_ref($conn);
}

function bg_store_pending_checkout(array $payload, string $orderRef, string $sessionId): bool
{
    $dir = bg_pending_payment_dir();
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        return false;
    }

    $payload['order_ref'] = $orderRef;
    $payload['paymongo_session_id'] = $sessionId;
    $payload['stored_at'] = date(DATE_ATOM);
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json)) {
        return false;
    }

    $ok = file_put_contents($dir . '/' . bg_safe_ref($orderRef) . '.json', $json) !== false;
    if ($sessionId !== '') {
        $ok = (file_put_contents($dir . '/session_' . bg_safe_ref($sessionId) . '.json', $json) !== false) && $ok;
    }
    return $ok;
}

function bg_load_pending_checkout(string $orderRef = '', string $sessionId = ''): array
{
    $dir = bg_pending_payment_dir();
    $candidates = [];
    if ($orderRef !== '') {
        $candidates[] = $dir . '/' . bg_safe_ref($orderRef) . '.json';
    }
    if ($sessionId !== '') {
        $candidates[] = $dir . '/session_' . bg_safe_ref($sessionId) . '.json';
    }

    foreach ($candidates as $file) {
        if (!is_file($file)) {
            continue;
        }
        $decoded = json_decode((string)file_get_contents($file), true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    return [];
}

function bg_delete_pending_checkout(string $orderRef = '', string $sessionId = ''): void
{
    $dir = bg_pending_payment_dir();
    foreach ([
        $orderRef !== '' ? $dir . '/' . bg_safe_ref($orderRef) . '.json' : '',
        $sessionId !== '' ? $dir . '/session_' . bg_safe_ref($sessionId) . '.json' : '',
    ] as $file) {
        if ($file !== '' && is_file($file)) {
            @unlink($file);
        }
    }
}

function bg_table_columns(mysqli $conn, string $table): array
{
    $columns = [];
    $result = $conn->query('SHOW COLUMNS FROM `' . $conn->real_escape_string($table) . '`');
    if ($result instanceof mysqli_result) {
        while ($row = $result->fetch_assoc()) {
            $columns[] = (string)($row['Field'] ?? '');
        }
        $result->free();
    }
    return $columns;
}

function bg_bind_params(mysqli_stmt $stmt, string $types, array $values): void
{
    if ($types === '') {
        return;
    }
    $args = [$types];
    for ($i = 0; $i < count($values); $i++) {
        $args[] = &$values[$i];
    }
    call_user_func_array([$stmt, 'bind_param'], $args);
}

function bg_order_lookup(mysqli $conn, string $orderRef): ?array
{
    $stmt = $conn->prepare("SELECT id, status FROM `orders` WHERE `order_ref` = ? LIMIT 1");
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('s', $orderRef);
    $stmt->execute();
    $res = method_exists($stmt, 'get_result') ? $stmt->get_result() : null;
    $row = $res instanceof mysqli_result ? $res->fetch_assoc() : null;
    if ($res instanceof mysqli_result) {
        $res->free();
    }
    $stmt->close();
    return is_array($row) ? $row : null;
}

function bg_ensure_order_tables(mysqli $conn): void
{
    $conn->query(
        "CREATE TABLE IF NOT EXISTS `orders` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `order_ref` VARCHAR(120) DEFAULT NULL,
            `customer_first` VARCHAR(120) DEFAULT NULL,
            `customer_last` VARCHAR(120) DEFAULT NULL,
            `customer_email` VARCHAR(190) DEFAULT NULL,
            `customer_phone` VARCHAR(32) DEFAULT NULL,
            `customer_address` TEXT,
            `delivery_type` VARCHAR(32) DEFAULT NULL,
            `shipping_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `payment_method` VARCHAR(80) DEFAULT NULL,
            `notes` TEXT,
            `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
            `status_updated_at` TIMESTAMP NULL DEFAULT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_order_ref` (`order_ref`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $columns = bg_table_columns($conn, 'orders');
    $needed = [
        'status' => "ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'pending'",
        'status_updated_at' => "ADD COLUMN `status_updated_at` TIMESTAMP NULL DEFAULT NULL",
        'proof_delivery_image' => "ADD COLUMN `proof_delivery_image` VARCHAR(255) DEFAULT NULL",
        'customer_phone' => "ADD COLUMN `customer_phone` VARCHAR(32) DEFAULT NULL",
        'customer_street_address' => "ADD COLUMN `customer_street_address` VARCHAR(255) DEFAULT NULL",
        'customer_apartment' => "ADD COLUMN `customer_apartment` VARCHAR(255) DEFAULT NULL",
        'customer_barangay' => "ADD COLUMN `customer_barangay` VARCHAR(255) DEFAULT NULL",
        'customer_municipality' => "ADD COLUMN `customer_municipality` VARCHAR(255) DEFAULT NULL",
        'customer_province' => "ADD COLUMN `customer_province` VARCHAR(255) DEFAULT NULL",
        'customer_region' => "ADD COLUMN `customer_region` VARCHAR(255) DEFAULT NULL",
        'customer_postal_code' => "ADD COLUMN `customer_postal_code` VARCHAR(32) DEFAULT NULL",
        'customer_country' => "ADD COLUMN `customer_country` VARCHAR(128) DEFAULT NULL",
        'paymongo_session_id' => "ADD COLUMN `paymongo_session_id` VARCHAR(120) DEFAULT NULL",
    ];
    $alter = [];
    foreach ($needed as $column => $sql) {
        if (!in_array($column, $columns, true)) {
            $alter[] = $sql;
        }
    }
    if ($alter) {
        $conn->query("ALTER TABLE `orders` " . implode(', ', $alter));
    }

    $conn->query(
        "CREATE TABLE IF NOT EXISTS `order_items` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `order_id` INT UNSIGNED NOT NULL,
            `product_id` INT NOT NULL DEFAULT 0,
            `title` VARCHAR(255) NOT NULL,
            `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `qty` INT NOT NULL DEFAULT 1,
            PRIMARY KEY (`id`),
            KEY `idx_order_id` (`order_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
}

function bg_create_order_from_paid_checkout(mysqli $conn, array $payload, string $orderRef, string $sessionId = ''): array
{
    bg_ensure_order_tables($conn);
    $existing = bg_order_lookup($conn, $orderRef);
    if (is_array($existing)) {
        return ['created' => false, 'id' => (int)($existing['id'] ?? 0), 'status' => (string)($existing['status'] ?? 'pending')];
    }

    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    if (!$items) {
        throw new RuntimeException('Paid checkout has no saved items.');
    }

    $customerName = trim((string)($payload['customer_name'] ?? ''));
    $nameParts = preg_split('/\s+/', $customerName) ?: [];
    $firstName = trim((string)($payload['firstName'] ?? array_shift($nameParts) ?? 'Customer'));
    $lastName = trim((string)($payload['lastName'] ?? implode(' ', $nameParts)));
    $streetAddress = trim((string)($payload['address'] ?? $payload['customer_address'] ?? ''));
    $apartment = trim((string)($payload['apartment'] ?? ''));
    $barangay = trim((string)($payload['barangay'] ?? ''));
    $municipality = trim((string)($payload['municipality'] ?? $payload['city'] ?? ''));
    $province = trim((string)($payload['province'] ?? ''));
    $region = trim((string)($payload['region'] ?? ''));
    $postalCode = trim((string)($payload['postalCode'] ?? $payload['postal_code'] ?? ''));
    $country = trim((string)($payload['country'] ?? 'Philippines'));
    $addressParts = array_filter([$streetAddress, $apartment, $barangay, $municipality, $province, $region, $postalCode, $country], fn($v) => trim((string)$v) !== '');
    $fullAddress = implode(', ', $addressParts);
    $shippingFee = (float)($payload['shippingFee'] ?? $payload['shipping_fee'] ?? 0);
    $total = (float)($payload['total'] ?? 0);
    if ($total <= 0) {
        foreach ($items as $item) {
            $total += ((float)($item['price'] ?? 0)) * max(1, (int)($item['qty'] ?? $item['quantity'] ?? 1));
        }
        $total += $shippingFee;
    }

    $columns = bg_table_columns($conn, 'orders');
    $map = [
        'order_ref' => ['s', $orderRef],
        'customer_first' => ['s', $firstName],
        'customer_last' => ['s', $lastName],
        'customer_email' => ['s', trim((string)($payload['customer_email'] ?? $payload['email'] ?? ''))],
        'customer_phone' => ['s', preg_replace('/\D+/', '', (string)($payload['customer_phone'] ?? $payload['phone'] ?? ''))],
        'customer_address' => ['s', $fullAddress !== '' ? $fullAddress : $streetAddress],
        'customer_street_address' => ['s', $streetAddress],
        'customer_apartment' => ['s', $apartment],
        'customer_barangay' => ['s', $barangay],
        'customer_municipality' => ['s', $municipality],
        'customer_province' => ['s', $province],
        'customer_region' => ['s', $region],
        'customer_postal_code' => ['s', $postalCode],
        'customer_country' => ['s', $country],
        'delivery_type' => ['s', trim((string)($payload['deliveryType'] ?? $payload['delivery_type'] ?? 'ship'))],
        'shipping_fee' => ['d', $shippingFee],
        'total' => ['d', $total],
        'payment_method' => ['s', 'GCash QRPH'],
        'notes' => ['s', trim((string)($payload['notes'] ?? ''))],
        'status' => ['s', 'pending'],
        'status_updated_at' => ['s', date('Y-m-d H:i:s')],
        'paymongo_session_id' => ['s', $sessionId],
    ];

    $insertCols = [];
    $placeholders = [];
    $types = '';
    $values = [];
    foreach ($map as $column => $entry) {
        if (!in_array($column, $columns, true)) {
            continue;
        }
        $insertCols[] = '`' . $column . '`';
        $placeholders[] = '?';
        $types .= $entry[0];
        $values[] = $entry[1];
    }
    if (in_array('created_at', $columns, true)) {
        $insertCols[] = '`created_at`';
        $placeholders[] = 'NOW()';
    }

    $stmt = $conn->prepare('INSERT INTO `orders` (' . implode(', ', $insertCols) . ') VALUES (' . implode(', ', $placeholders) . ')');
    if (!$stmt) {
        throw new RuntimeException('Could not prepare paid order insert: ' . $conn->error);
    }
    bg_bind_params($stmt, $types, $values);
    if (!$stmt->execute()) {
        $error = $stmt->error ?: $conn->error;
        $stmt->close();
        throw new RuntimeException('Could not insert paid order: ' . $error);
    }
    $orderDbId = (int)$conn->insert_id;
    $stmt->close();

    $itemColumns = bg_table_columns($conn, 'order_items');
    $usable = array_values(array_filter(['order_id', 'product_id', 'title', 'price', 'qty'], fn($column) => in_array($column, $itemColumns, true)));
    if ($usable) {
        $itemStmt = $conn->prepare('INSERT INTO `order_items` (`' . implode('`, `', $usable) . '`) VALUES (' . implode(', ', array_fill(0, count($usable), '?')) . ')');
        if ($itemStmt) {
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $itemTypes = '';
                $itemValues = [];
                foreach ($usable as $column) {
                    if ($column === 'order_id') {
                        $itemTypes .= 'i';
                        $itemValues[] = $orderDbId;
                    } elseif ($column === 'product_id') {
                        $itemTypes .= 'i';
                        $itemValues[] = (int)($item['id'] ?? $item['product_id'] ?? 0);
                    } elseif ($column === 'title') {
                        $itemTypes .= 's';
                        $itemValues[] = (string)($item['title'] ?? $item['name'] ?? '');
                    } elseif ($column === 'price') {
                        $itemTypes .= 'd';
                        $itemValues[] = (float)($item['price'] ?? 0);
                    } elseif ($column === 'qty') {
                        $itemTypes .= 'i';
                        $itemValues[] = max(1, (int)($item['qty'] ?? $item['quantity'] ?? 1));
                    }
                }
                bg_bind_params($itemStmt, $itemTypes, $itemValues);
                $itemStmt->execute();
            }
            $itemStmt->close();
        }
    }

    return ['created' => true, 'id' => $orderDbId, 'status' => 'pending'];
}
