<?php
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
    foreach (['sizes_json', 'sizes'] as $column) {
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
    $descriptionColumn = getProductDescriptionColumn($conn);
    $selectDescription = $descriptionColumn ? ", {$descriptionColumn} AS description, {$descriptionColumn} AS `desc`" : '';
    $sizesColumn = getProductSizesColumn($conn);
    $selectSizes = $sizesColumn ? ", {$sizesColumn} AS sizes_json" : ", NULL AS sizes_json";
    $reviewsJoin = '';
    $reviewsFields = ', NULL AS rating, 0 AS review_count';
    if (hasTable($conn, 'reviews')) {
        $reviewsJoin = ' LEFT JOIN (SELECT product_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE product_id IS NOT NULL GROUP BY product_id) review_stats ON review_stats.product_id = products.id';
        $reviewsFields = ', review_stats.avg_rating AS rating, review_stats.review_count AS review_count';
    }

    // Optional: support ?id= or ?q=
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];
        $stmt = $conn->prepare("SELECT products.id, products.title, products.type, products.price, products.stock, products.img{$selectDescription}{$selectSizes}{$reviewsFields}, products.created_at FROM products{$reviewsJoin} WHERE products.id = ? LIMIT 1");
        if (! $stmt) throw new Exception($conn->error);
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res ? $res->fetch_assoc() : null;
        if (is_array($row)) {
            $decodedSizes = json_decode((string) ($row['sizes_json'] ?? ''), true);
            $row['sizes'] = is_array($decodedSizes) ? $decodedSizes : [];
        }
        echo json_encode($row ?: new stdClass());
        $stmt->close();
        $conn->close();
        exit;
    }

    if (isset($_GET['q'])) {
        $q = '%' . $conn->real_escape_string($_GET['q']) . '%';
        $stmt = $conn->prepare("SELECT products.id, products.title, products.type, products.price, products.stock, products.img{$selectDescription}{$selectSizes}{$reviewsFields}, products.created_at FROM products{$reviewsJoin} WHERE products.title LIKE ? OR products.type LIKE ? ORDER BY products.id");
        if (! $stmt) throw new Exception($conn->error);
        $stmt->bind_param('ss', $q, $q);
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($r = $res->fetch_assoc()) {
            $decodedSizes = json_decode((string) ($r['sizes_json'] ?? ''), true);
            $r['sizes'] = is_array($decodedSizes) ? $decodedSizes : [];
            $rows[] = $r;
        }
        echo json_encode($rows);
        $stmt->close();
        $conn->close();
        exit;
    }

    $sql = "SELECT products.id, products.title, products.type, products.price, products.stock, products.img{$selectDescription}{$selectSizes}{$reviewsFields}, products.created_at FROM products{$reviewsJoin} ORDER BY products.id";
    $result = $conn->query($sql);
    if ($result === false) throw new Exception($conn->error);

    $rows = [];
    while ($r = $result->fetch_assoc()) {
        $decodedSizes = json_decode((string) ($r['sizes_json'] ?? ''), true);
        $r['sizes'] = is_array($decodedSizes) ? $decodedSizes : [];
        $rows[] = $r;
    }

    echo json_encode($rows);
    $result->free();
    $conn->close();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
