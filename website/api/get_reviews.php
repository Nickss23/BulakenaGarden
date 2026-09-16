<?php
header('Content-Type: application/json; charset=utf-8');
try {
    require_once __DIR__ . '/../../includes/config.php';

    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 200;
    if ($limit <= 0 || $limit > 1000) $limit = 200;

    // optional filters
    $rating = isset($_GET['rating']) ? (int) $_GET['rating'] : 0; // interpreted as exact rating (1..5)
    $service = isset($_GET['service']) ? trim((string)$_GET['service']) : '';
    $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
    $source = isset($_GET['source']) ? strtolower(trim((string)$_GET['source'])) : '';
    if ($source === 'feedback') $source = 'service';
    if (!in_array($source, ['', 'product', 'service'], true)) $source = '';

    $rows = [];

    // safe-escape search strings
    $serviceNorm = strtolower(trim($service));
    // Normalize common separators so "Swimming Pool" can match "swimming-pool" and vice-versa.
    $serviceKey = preg_replace('/-+/', '-', str_replace([' ', '_'], '-', $serviceNorm));
    $serviceEsc = $conn->real_escape_string($serviceKey);
    $qEsc = $conn->real_escape_string($q);

    // Check for table existence to avoid fatal errors on installations without both tables
    $hasReviewsTable = false;
    $hasFeedbackTable = false;
    try {
        $t1 = $conn->query("SHOW TABLES LIKE 'reviews'");
        if ($t1 && $t1->num_rows) $hasReviewsTable = true;
        if ($t1) $t1->free();
    } catch (Throwable $e) { /* ignore */ }
    try {
        $t2 = $conn->query("SHOW TABLES LIKE 'feedback'");
        if ($t2 && $t2->num_rows) $hasFeedbackTable = true;
        if ($t2) $t2->free();
    } catch (Throwable $e) { /* ignore */ }

    // 1) product reviews (reviews table) -- include if table exists
    // If a specific service is selected (non-empty and not "product"), do not include product reviews.
    if ($source !== 'service' && $hasReviewsTable && ($serviceKey === '' || $serviceKey === 'product')) {
        // Detect columns so we can safely support older reviews table schemas.
        $revCols = [];
        $colRes = $conn->query("SHOW COLUMNS FROM `reviews`");
        if ($colRes) {
            while ($c = $colRes->fetch_assoc()) $revCols[$c['Field']] = true;
            $colRes->free();
        }
        $revName = isset($revCols['reviewer_name']) ? "r.reviewer_name" : (isset($revCols['name']) ? "r.name" : "NULL");
        $revEmail = isset($revCols['reviewer_email']) ? "r.reviewer_email" : (isset($revCols['email']) ? "r.email" : "NULL");

        $revSql = "SELECT r.id, r.product_id, r.order_ref, r.rating, r.text, r.anonymous, r.media, r.created_at, p.title AS product_title, p.img AS product_img, 'product' AS source, NULL AS service, $revName AS name, $revEmail AS email, NULL AS appointment_id FROM reviews r LEFT JOIN products p ON p.id = r.product_id";
        $revWhere = [];
        if ($rating) $revWhere[] = "r.rating = " . (int)$rating;
        if ($qEsc !== '') {
            $parts = ["r.text LIKE '%$qEsc%'", "p.title LIKE '%$qEsc%'"];
            if (isset($revCols['reviewer_name'])) $parts[] = "r.reviewer_name LIKE '%$qEsc%'";
            else if (isset($revCols['name'])) $parts[] = "r.name LIKE '%$qEsc%'";
            if (!empty($parts)) $revWhere[] = '(' . implode(' OR ', $parts) . ')';
        }
        if (!empty($revWhere)) $revSql .= ' WHERE ' . implode(' AND ', $revWhere);
        $revSql .= " ORDER BY r.created_at DESC LIMIT " . (int)$limit;

        $res = $conn->query($revSql);
        if ($res) {
            while ($r = $res->fetch_assoc()) $rows[] = $r;
            $res->free();
        }
    }

    // 2) service feedback (feedback table) -- include when table exists
    // If "product" is selected, do not include service feedback.
    if ($source !== 'product' && $hasFeedbackTable && $serviceKey !== 'product') {
        // Detect columns so we can safely support older feedback table schemas.
        $fbCols = [];
        $colRes = $conn->query("SHOW COLUMNS FROM `feedback`");
        if ($colRes) {
            while ($c = $colRes->fetch_assoc()) $fbCols[$c['Field']] = true;
            $colRes->free();
        }

        $fbRating = isset($fbCols['rating']) ? "f.rating" : "NULL";
        $fbText = isset($fbCols['text']) ? "f.text" : (isset($fbCols['message']) ? "f.message" : "NULL");
        $fbAnon = isset($fbCols['anonymous']) ? "f.anonymous" : "0";
        $fbMedia = isset($fbCols['media']) ? "f.media" : "NULL";
        $fbCreated = isset($fbCols['created_at']) ? "f.created_at" : "NULL";
        $fbService = isset($fbCols['service']) ? "f.service" : "NULL";
        $fbName = isset($fbCols['name']) ? "f.name" : "NULL";
        $fbEmail = isset($fbCols['email']) ? "f.email" : "NULL";
        $fbApptId = isset($fbCols['appointment_id']) ? "f.appointment_id" : "NULL";

        $fbSql = "SELECT f.id, NULL AS product_id, NULL AS order_ref, $fbRating AS rating, $fbText AS text, $fbAnon AS anonymous, $fbMedia AS media, $fbCreated AS created_at, NULL AS product_title, NULL AS product_img, 'service' AS source, $fbService AS service, $fbName AS name, $fbEmail AS email, $fbApptId AS appointment_id FROM feedback f";
        $fbWhere = [];
        if ($rating && isset($fbCols['rating'])) $fbWhere[] = "f.rating = " . (int)$rating;
        if ($serviceEsc !== '' && isset($fbCols['service'])) {
            $fbWhere[] = "REPLACE(REPLACE(LOWER(f.service),' ','-'),'_','-') = '$serviceEsc'";
        }
        if ($qEsc !== '') {
            $parts = [];
            if (isset($fbCols['text'])) $parts[] = "f.text LIKE '%$qEsc%'";
            else if (isset($fbCols['message'])) $parts[] = "f.message LIKE '%$qEsc%'";
            if (isset($fbCols['name'])) $parts[] = "f.name LIKE '%$qEsc%'";
            if (!empty($parts)) $fbWhere[] = '(' . implode(' OR ', $parts) . ')';
        }
        if (!empty($fbWhere)) $fbSql .= ' WHERE ' . implode(' AND ', $fbWhere);
        $fbSql .= " ORDER BY " . (isset($fbCols['created_at']) ? "f.created_at" : "f.id") . " DESC LIMIT " . (int)$limit;

        $res2 = $conn->query($fbSql);
        if ($res2) {
            while ($r = $res2->fetch_assoc()) $rows[] = $r;
            $res2->free();
        }
    }

    // Enforce service filter across merged sources (so selecting a service doesn't show product reviews).
    if ($serviceKey !== '') {
        if ($serviceKey === 'product') {
            $rows = array_filter($rows, function($r){ return isset($r['source']) && $r['source'] === 'product'; });
        } else {
            $rows = array_filter($rows, function($r) use ($serviceKey) {
                if (!isset($r['source']) || $r['source'] !== 'service') return false;
                $s = strtolower(trim((string)($r['service'] ?? '')));
                $k = preg_replace('/-+/', '-', str_replace([' ', '_'], '-', $s));
                return $k === $serviceKey;
            });
        }
    }

    // sort combined results by created_at desc and slice to limit
    usort($rows, function($a,$b){ $ta = strtotime($a['created_at'] ?? '0'); $tb = strtotime($b['created_at'] ?? '0'); return $tb <=> $ta; });
    $rows = array_slice($rows, 0, (int)$limit);

    echo json_encode(array_values($rows));
    $conn->close();

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

?>
