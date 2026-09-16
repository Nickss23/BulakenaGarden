<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
auth_require_admin_json();

header('Content-Type: application/json; charset=utf-8');

function getProductDescriptionColumn(mysqli $conn): ?string
{
    $result = $conn->query("SHOW COLUMNS FROM products LIKE 'description'");
    if ($result instanceof mysqli_result) {
        $hasDescription = $result->num_rows > 0;
        $result->free();
        if ($hasDescription) {
            return 'description';
        }
    }

    $result = $conn->query("SHOW COLUMNS FROM products LIKE 'desc'");
    if ($result instanceof mysqli_result) {
        $hasDesc = $result->num_rows > 0;
        $result->free();
        if ($hasDesc) {
            return 'desc';
        }
    }

    return null;
}

function getProductSizesColumn(mysqli $conn): ?string
{
    $candidates = ['sizes_json', 'sizes'];
    foreach ($candidates as $column) {
        $result = $conn->query("SHOW COLUMNS FROM products LIKE '{$column}'");
        if ($result instanceof mysqli_result) {
            $exists = $result->num_rows > 0;
            $result->free();
            if ($exists) {
                return $column;
            }
        }
    }

    return null;
}

function ensureProductSizesColumn(mysqli $conn): string
{
    $existing = getProductSizesColumn($conn);
    if ($existing) {
        return $existing;
    }

    if (! $conn->query("ALTER TABLE products ADD COLUMN sizes_json LONGTEXT NULL AFTER price")) {
        throw new Exception('Could not add sizes_json column: ' . $conn->error);
    }

    return 'sizes_json';
}

function ensureProductTypeOption(mysqli $conn, string $requiredValue): void
{
    $result = $conn->query("SHOW COLUMNS FROM products LIKE 'type'");
    if (! ($result instanceof mysqli_result)) {
        throw new Exception('Could not inspect products.type column.');
    }

    $column = $result->fetch_assoc();
    $result->free();
    if (! is_array($column)) {
        throw new Exception('products.type column was not found.');
    }

    $typeDefinition = (string) ($column['Type'] ?? '');
    if (stripos($typeDefinition, 'enum(') !== 0) {
        return;
    }

    preg_match_all("/'((?:[^'\\\\]|\\\\.)*)'/", $typeDefinition, $matches);
    $values = array_map(static function ($value) {
        return str_replace("\\'", "'", (string) $value);
    }, $matches[1] ?? []);

    if (in_array($requiredValue, $values, true)) {
        return;
    }

    $values[] = $requiredValue;
    $quoted = array_map([$conn, 'real_escape_string'], $values);
    $enumSql = "'" . implode("','", $quoted) . "'";

    if (! $conn->query("ALTER TABLE products MODIFY COLUMN type ENUM({$enumSql}) NOT NULL DEFAULT 'Indoor'")) {
        throw new Exception('Could not update product type options: ' . $conn->error);
    }
}

function normalizePostedSizes($rawSizes): array
{
    if (is_string($rawSizes)) {
        $decoded = json_decode($rawSizes, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $rawSizes = $decoded;
        }
    }

    if (! is_array($rawSizes)) {
        return [];
    }

    $sizes = [];
    foreach ($rawSizes as $entry) {
        if (! is_array($entry)) {
            continue;
        }

        $label = trim((string) ($entry['label'] ?? $entry['size'] ?? $entry['name'] ?? ''));
        $price = isset($entry['price']) && $entry['price'] !== '' ? (float) $entry['price'] : null;
        $stock = isset($entry['stock']) && $entry['stock'] !== '' ? (int) $entry['stock'] : 0;

        if ($label === '' || $price === null || $price < 0 || $stock < 0) {
            continue;
        }

        $sizes[] = [
            'label' => $label,
            'price' => $price,
            'stock' => $stock,
        ];
    }

    return $sizes;
}

function getTotalStockFromSizes(array $sizes): int
{
    $total = 0;
    foreach ($sizes as $entry) {
        $total += (int) ($entry['stock'] ?? 0);
    }

    return max(0, $total);
}

function storeUploadedProductImage(array $file): string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return '';
    }

    $uploadError = (int) ($file['error'] ?? UPLOAD_ERR_OK);
    if ($uploadError !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_INI_SIZE => 'The selected image is too large for the server upload limit.',
            UPLOAD_ERR_FORM_SIZE => 'The selected image is too large for this form.',
            UPLOAD_ERR_PARTIAL => 'The image upload was interrupted. Please try again.',
            UPLOAD_ERR_NO_TMP_DIR => 'PHP has no temporary upload folder configured.',
            UPLOAD_ERR_CANT_WRITE => 'The server could not write the uploaded image to disk.',
            UPLOAD_ERR_EXTENSION => 'A PHP extension stopped the image upload.',
        ];
        throw new Exception($messages[$uploadError] ?? 'Image upload failed.');
    }

    $tmpPath = (string) ($file['tmp_name'] ?? '');
    if ($tmpPath === '' || ! is_uploaded_file($tmpPath)) {
        throw new Exception('Invalid uploaded image.');
    }

    $originalName = (string) ($file['name'] ?? 'image');
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'jfif'];
    if (! in_array($extension, $allowedExtensions, true)) {
        throw new Exception('Unsupported image type. Use JPG, PNG, GIF, WEBP, or JFIF.');
    }

    $imageInfo = @getimagesize($tmpPath);
    if ($imageInfo === false) {
        throw new Exception('The selected file is not a valid image.');
    }

    $uploadDir = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'products';
    if (! is_dir($uploadDir) && ! mkdir($uploadDir, 0777, true) && ! is_dir($uploadDir)) {
        throw new Exception('Could not create product upload folder.');
    }
    if (! is_writable($uploadDir)) {
        throw new Exception('Product upload folder is not writable: ' . $uploadDir);
    }

    $baseName = pathinfo($originalName, PATHINFO_FILENAME);
    $safeBaseName = preg_replace('/[^A-Za-z0-9_-]+/', '-', $baseName);
    $safeBaseName = trim((string) $safeBaseName, '-');
    if ($safeBaseName === '') {
        $safeBaseName = 'product-image';
    }

    $fileName = time() . '_' . $safeBaseName . '.' . $extension;
    $targetPath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

    if (! move_uploaded_file($tmpPath, $targetPath)) {
        throw new Exception('Could not save uploaded image.');
    }

    return 'uploads/products/' . $fileName;
}

try {
    require_once __DIR__ . '/../../includes/config.php';
    $descriptionColumn = getProductDescriptionColumn($conn);
    $sizesColumn = ensureProductSizesColumn($conn);
    ensureProductTypeOption($conn, 'Hanging Plants');
    ensureProductTypeOption($conn, 'Table Plants');

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed. Use POST.']);
        exit;
    }

    // Read and validate input
    $id = isset($_POST['id']) && $_POST['id'] !== '' ? (int) $_POST['id'] : 0;
    $title = isset($_POST['title']) ? trim((string)$_POST['title']) : '';
    $type  = isset($_POST['type']) ? trim((string)$_POST['type']) : '';
    $price = isset($_POST['price']) && $_POST['price'] !== '' ? (float) $_POST['price'] : 0.0;
    $stock = isset($_POST['stock']) && $_POST['stock'] !== '' ? (int) $_POST['stock'] : 0;
    $img   = isset($_POST['current_img']) ? trim((string) $_POST['current_img']) : '';
    $description = isset($_POST['description']) ? trim((string)$_POST['description']) : '';
    $sizes = normalizePostedSizes($_POST['sizes'] ?? []);
    if (isset($_FILES['image_file'])) {
        $uploadedImagePath = storeUploadedProductImage($_FILES['image_file']);
        if ($uploadedImagePath !== '') {
            $img = $uploadedImagePath;
        }
    }
    if (! empty($sizes)) {
        $stock = getTotalStockFromSizes($sizes);
    }
    $sizesJson = json_encode($sizes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($sizesJson === false) {
        throw new Exception('Could not encode product sizes.');
    }

    if ($title === '') {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Product title is required.']);
        exit;
    }
    if ($price < 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Price must be >= 0.']);
        exit;
    }
    if ($stock < 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Stock must be >= 0.']);
        exit;
    }
    if ($id > 0) {
        // Update existing product
        $sql = "UPDATE products SET title = ?, type = ?, price = ?, {$sizesColumn} = ?, stock = ?, img = ?";
        if ($descriptionColumn) {
            $sql .= ", {$descriptionColumn} = ?";
        }
        $sql .= " WHERE id = ?";
        $stmt = $conn->prepare($sql);
        if (! $stmt) throw new Exception('Prepare failed: ' . $conn->error);
        if ($descriptionColumn) {
            $stmt->bind_param('ssdsissi', $title, $type, $price, $sizesJson, $stock, $img, $description, $id);
        } else {
            $stmt->bind_param('ssdsisi', $title, $type, $price, $sizesJson, $stock, $img, $id);
        }
        if (! $stmt->execute()) {
            throw new Exception('Execute failed: ' . $stmt->error);
        }
        $affected = $stmt->affected_rows;
        $stmt->close();

        echo json_encode(['success' => true, 'message' => 'Product updated.', 'id' => $id, 'affected_rows' => $affected]);
        $conn->close();
        exit;
    }

    // Insert new product
    $sql = "INSERT INTO products (title, type, price, {$sizesColumn}, stock, img";
    if ($descriptionColumn) {
        $sql .= ", {$descriptionColumn}";
    }
    $sql .= ") VALUES (?, ?, ?, ?, ?, ?";
    if ($descriptionColumn) {
        $sql .= ", ?";
    }
    $sql .= ")";
    $stmt = $conn->prepare($sql);
    if (! $stmt) throw new Exception('Prepare failed: ' . $conn->error);
    if ($descriptionColumn) {
        $stmt->bind_param('ssdsiss', $title, $type, $price, $sizesJson, $stock, $img, $description);
    } else {
        $stmt->bind_param('ssdsis', $title, $type, $price, $sizesJson, $stock, $img);
    }
    if (! $stmt->execute()) {
        throw new Exception('Execute failed: ' . $stmt->error);
    }

    $newId = $stmt->insert_id;
    $stmt->close();
    $conn->close();

    echo json_encode(['success' => true, 'message' => 'Product created.', 'id' => $newId]);
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
    exit;
}
?>
