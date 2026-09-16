<?php
header('Content-Type: application/json; charset=utf-8');
try {
    require_once __DIR__ . '/../../includes/config.php';

    // Basic inputs
    $product_id = isset($_POST['product_id']) ? trim($_POST['product_id']) : '';
    $order_id   = isset($_POST['order_id']) ? trim($_POST['order_id']) : '';
    $name       = isset($_POST['name']) ? trim($_POST['name']) : '';
    $email      = isset($_POST['email']) ? trim($_POST['email']) : '';
    $rating     = isset($_POST['rating']) ? (int) $_POST['rating'] : 0;
    $text       = isset($_POST['text']) ? trim($_POST['text']) : (isset($_POST['review']) ? trim($_POST['review']) : '');
    $anonymous  = isset($_POST['anonymous']) && ($_POST['anonymous'] === '1' || $_POST['anonymous'] === 1) ? 1 : 0;

    if ($rating < 1 || $rating > 5) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Rating must be between 1 and 5']);
        exit;
    }

    // Privacy: if anonymous is enabled, do not store identity fields.
    if ($anonymous === 1) {
        $name = '';
        $email = '';
    }

    if ($order_id !== '') {
        $dupStmt = $conn->prepare("SELECT `id` FROM `reviews` WHERE `order_ref` = ? LIMIT 1");
        if ($dupStmt) {
            $dupStmt->bind_param('s', $order_id);
            if ($dupStmt->execute()) {
                $dupRes = $dupStmt->get_result();
                if ($dupRes && $dupRes->num_rows > 0) {
                    if ($dupRes) $dupRes->free();
                    $dupStmt->close();
                    http_response_code(409);
                    echo json_encode(['success' => false, 'error' => 'This order has already been reviewed.']);
                    exit;
                }
                if ($dupRes) $dupRes->free();
            }
            $dupStmt->close();
        }
    }

    // Prepare uploads directory
    $uploadDir = __DIR__ . '/../../uploads/reviews/';
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
            throw new Exception('Failed to create uploads directory');
        }
    }

    $mediaPath = null;
    // Handle optional media upload
    if (!empty($_FILES['media']) && is_array($_FILES['media'])) {
        $file = $_FILES['media'];
        if ($file['error'] === UPLOAD_ERR_OK) {
            // Validate size (max 10MB)
            if ($file['size'] > 10 * 1024 * 1024) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'File too large (max 10MB)']);
                exit;
            }

            // Validate MIME type
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
            $allowed = [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'video/mp4', 'video/quicktime', 'video/webm'
            ];
            if (!in_array($mime, $allowed, true)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Unsupported file type']);
                exit;
            }

            // Generate safe filename
            $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
            $basename = bin2hex(random_bytes(8)) . '_' . time();
            $filename = $basename . ($ext ? '.' . $ext : '');
            $target = $uploadDir . $filename;
            if (!move_uploaded_file($file['tmp_name'], $target)) {
                // not fatal, continue without media
            } else {
                // store web-accessible path
                $mediaPath = 'uploads/reviews/' . $filename;
            }
        }
    }

    // Ensure reviews table exists
    $createSql = "CREATE TABLE IF NOT EXISTS `reviews` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `product_id` INT UNSIGNED DEFAULT NULL,
      `order_ref` VARCHAR(120) DEFAULT NULL,
      `name` VARCHAR(191) DEFAULT NULL,
      `email` VARCHAR(191) DEFAULT NULL,
      `rating` TINYINT UNSIGNED NOT NULL DEFAULT 5,
      `text` TEXT,
      `anonymous` TINYINT(1) DEFAULT 0,
      `media` VARCHAR(255) DEFAULT NULL,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(`id`),
      KEY `idx_reviews_product` (`product_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
    if (!$conn->query($createSql)) {
        throw new Exception('Failed to ensure reviews table: ' . $conn->error);
    }

    // Backward-compat: add identity columns if an older reviews table exists without them.
    $revCols = [];
    try {
        $colRes = $conn->query("SHOW COLUMNS FROM `reviews`");
        if ($colRes) {
            while ($c = $colRes->fetch_assoc()) $revCols[$c['Field']] = true;
            $colRes->free();
        }
        $toAdd = [];
        if (!isset($revCols['name'])) $toAdd[] = "ADD COLUMN `name` VARCHAR(191) DEFAULT NULL";
        if (!isset($revCols['email'])) $toAdd[] = "ADD COLUMN `email` VARCHAR(191) DEFAULT NULL";
        if (!empty($toAdd)) {
            $alterSql = "ALTER TABLE `reviews` " . implode(", ", $toAdd);
            @$conn->query($alterSql);
        }
        // refresh columns after attempted alter
        $revCols = [];
        $colRes2 = $conn->query("SHOW COLUMNS FROM `reviews`");
        if ($colRes2) {
            while ($c = $colRes2->fetch_assoc()) $revCols[$c['Field']] = true;
            $colRes2->free();
        }
    } catch (Throwable $e) { /* ignore */ }

    $hasNameCol = isset($revCols['name']);
    $hasEmailCol = isset($revCols['email']);

    // Insert review (schema-aware)
    if ($hasNameCol || $hasEmailCol) {
        $sql = "INSERT INTO `reviews` (product_id, order_ref, name, email, rating, text, anonymous, media) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);
        $nullMedia = $mediaPath === null ? null : $mediaPath;
        $stmt->bind_param('isssisis', $productIdParam, $orderRefParam, $nameParam, $emailParam, $ratingParam, $textParam, $anonParam, $mediaParam);
    } else {
        $sql = "INSERT INTO `reviews` (product_id, order_ref, rating, text, anonymous, media) VALUES (?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);
        $nullMedia = $mediaPath === null ? null : $mediaPath;
        $stmt->bind_param('isisis', $productIdParam, $orderRefParam, $ratingParam, $textParam, $anonParam, $mediaParam);
    }

    // bind param values with correct types
    $productIdParam = is_numeric($product_id) ? (int)$product_id : null;
    $orderRefParam  = $order_id !== '' ? $order_id : null;
    $nameParam      = $name !== '' ? $name : null;
    $emailParam     = $email !== '' ? $email : null;
    $ratingParam    = (int)$rating;
    $textParam      = $text;
    $anonParam      = (int)$anonymous;
    $mediaParam     = $nullMedia;

    if (!$stmt->execute()) {
        throw new Exception('Insert failed: ' . $stmt->error);
    }

    $insertId = $stmt->insert_id;
    $stmt->close();
    $conn->close();

    echo json_encode(['success' => true, 'id' => $insertId]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

?>
