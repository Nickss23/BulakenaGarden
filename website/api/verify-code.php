<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    auth_respond_json(405, ['success' => false, 'message' => 'Method not allowed. Use POST.']);
}

$userId = isset($_POST['user_id']) ? (int) $_POST['user_id'] : 0;
$verificationCode = trim((string) ($_POST['code'] ?? ''));

if ($userId <= 0) {
    auth_respond_json(422, ['success' => false, 'message' => 'User ID is required.']);
}

if (strlen($verificationCode) !== 6 || !ctype_digit($verificationCode)) {
    auth_respond_json(422, ['success' => false, 'message' => 'Verification code must be 6 digits.']);
}

try {
    require_once __DIR__ . '/../../includes/config.php';
    
    // Check if user exists
    $stmt = $conn->prepare("SELECT `id` FROM `users` WHERE `id` = ? LIMIT 1");
    if (!$stmt) {
        auth_respond_json(500, ['success' => false, 'message' => 'Database error.']);
    }
    
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $userExists = $result instanceof mysqli_result && $result->num_rows > 0;
    if ($result instanceof mysqli_result) {
        $result->free();
    }
    $stmt->close();
    
    if (!$userExists) {
        auth_respond_json(404, ['success' => false, 'message' => 'User not found.']);
    }
    
    // Verify the code
    if (auth_verify_email_code($conn, $userId, $verificationCode)) {
        auth_respond_json(200, [
            'success' => true,
            'message' => 'Email verified successfully. You can now log in.',
        ]);
    } else {
        auth_respond_json(401, [
            'success' => false,
            'message' => 'Invalid or expired verification code. Please check your email or request a new code.',
        ]);
    }
    
} catch (Throwable $e) {
    auth_respond_json(500, ['success' => false, 'message' => 'Server error while verifying code.', 'error' => $e->getMessage()]);
}
?>
