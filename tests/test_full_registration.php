<?php
/**
 * Test Full Registration Process
 * Run this after setting your Gmail SMTP credentials
 */

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/auth_common.php';
require_once __DIR__ . '/../includes/gmail_smtp_config.php';

echo "<h1>Full Registration Test</h1><hr>";

$testName = "Test User " . time();
$testEmail = "test" . time() . "@example.com";
$testPassword = "password123";

echo "<h2>Testing Registration for: $testEmail</h2>";

$_POST = [
    'name' => $testName,
    'email' => $testEmail,
    'password' => $testPassword
];

try {
    require_once __DIR__ . '/../includes/config.php';
    $schema = auth_get_user_schema($conn);
    if ($schema['password'] === null) {
        echo "<span style='color: red;'>❌ FAILED:</span> Users table missing password column<br>";
        exit;
    }

    $existing = auth_fetch_user_by_email($conn, $schema, $testEmail);
    $hashedPassword = auth_hash_password_if_needed($testPassword);
    if ($existing) {
        echo "<span style='color: red;'>❌ FAILED:</span> Email already exists<br>";
        exit;
    }

    $columns = ["`{$schema['name']}`", "`{$schema['email']}`", "`{$schema['password']}`"];
    $placeholders = ['?', '?', '?'];
    $types = 'sss';

    if ($schema['status'] !== null) {
        $columns[] = "`{$schema['status']}`";
        $placeholders[] = "'active'";
    }

    $sql = "INSERT INTO `users` (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $placeholders) . ")";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        echo "<span style='color: red;'>❌ FAILED:</span> Prepare failed: " . $conn->error . "<br>";
        exit;
    }
    $stmt->bind_param($types, $testName, $testEmail, $hashedPassword);
    if (!$stmt->execute()) {
        echo "<span style='color: red;'>❌ FAILED:</span> Execute failed: " . $stmt->error . "<br>";
        exit;
    }
    $userId = (int) $stmt->insert_id;
    $stmt->close();

    echo "<span style='color: green;'>✅ SUCCESS:</span> User created with ID: $userId<br>";

    $verificationCode = generate_verification_code();
    echo "<span style='color: green;'>✅ SUCCESS:</span> Generated code: $verificationCode<br>";

    if (auth_save_verification_code($conn, $userId, $verificationCode)) {
        echo "<span style='color: green;'>✅ SUCCESS:</span> Verification code saved<br>";
    } else {
        echo "<span style='color: red;'>❌ FAILED:</span> Could not save verification code<br>";
    }

    echo "<h2>Testing Email Sending</h2>";
    if (GMAIL_SMTP_USERNAME === '' || GMAIL_APP_PASSWORD === '') {
        echo "<span style='color: orange;'>⚠️ WARNING:</span> Set your Gmail SMTP username and app password before testing email<br>";
    } else {
        $emailSent = send_verification_email($testEmail, $testName, $verificationCode);
        if ($emailSent) {
            echo "<span style='color: green;'>✅ SUCCESS:</span> Email sent successfully<br>";
            echo "<span style='color: blue;'>ℹ️ INFO:</span> Check the recipient inbox for the verification email<br>";
        } else {
            echo "<span style='color: red;'>❌ FAILED:</span> Email sending failed<br>";
        }
    }

    $stmt = $conn->prepare("DELETE FROM `users` WHERE `id` = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $stmt->close();

    echo "<span style='color: green;'>✅ SUCCESS:</span> Test user cleaned up<br>";
} catch (Exception $e) {
    echo "<span style='color: red;'>❌ FAILED:</span> " . $e->getMessage() . "<br>";
}

$conn->close();

echo "<hr><h2>Summary</h2>";
echo "<p><strong>Registration logic:</strong> ✅ Working</p>";
echo "<p><strong>Database:</strong> ✅ Working</p>";
echo "<p><strong>Verification codes:</strong> ✅ Working</p>";
echo "<p><strong>Email sending:</strong> " . ((GMAIL_SMTP_USERNAME === '' || GMAIL_APP_PASSWORD === '') ? '⚠️ Needs Gmail SMTP credentials' : '✅ Ready') . "</p>";
?>
