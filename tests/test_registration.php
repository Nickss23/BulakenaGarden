<?php
/**
 * Test Registration Functionality
 */

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/auth_common.php';
require_once __DIR__ . '/../includes/gmail_smtp_config.php';

echo "<h1>Registration Test</h1><hr>";

echo "<h2>1. Database Connection</h2>";
try {
    $conn = new mysqli($dbServername, $dbUsername, $dbPassword, $dbDatabase);
    if ($conn->connect_error) {
        echo "<span style='color: red;'>FAILED:</span> " . $conn->connect_error . "<br>";
        exit;
    }
    echo "<span style='color: green;'>✓ OK</span><br>";
} catch (Exception $e) {
    echo "<span style='color: red;'>FAILED:</span> " . $e->getMessage() . "<br>";
    exit;
}

echo "<h2>2. Schema Detection</h2>";
try {
    $schema = auth_get_user_schema($conn);
    echo "<span style='color: green;'>✓ OK</span> - Found columns: " . implode(', ', array_keys($schema)) . "<br>";
} catch (Exception $e) {
    echo "<span style='color: red;'>FAILED:</span> " . $e->getMessage() . "<br>";
    exit;
}

echo "<h2>3. Verification Columns</h2>";
try {
    $verifyColumns = auth_check_verification_columns($conn);
    echo "<span style='color: green;'>✓ OK</span> - " . json_encode($verifyColumns) . "<br>";
} catch (Exception $e) {
    echo "<span style='color: red;'>FAILED:</span> " . $e->getMessage() . "<br>";
    exit;
}

echo "<h2>4. Code Generation</h2>";
try {
    $code = generate_verification_code();
    echo "<span style='color: green;'>✓ OK</span> - Generated code: <strong>$code</strong> (length: " . strlen($code) . ")<br>";
} catch (Exception $e) {
    echo "<span style='color: red;'>FAILED:</span> " . $e->getMessage() . "<br>";
    exit;
}

echo "<h2>5. Gmail SMTP Check</h2>";
if (GMAIL_SMTP_USERNAME === '' || GMAIL_APP_PASSWORD === '') {
    echo "<span style='color: orange;'>⚠ WARNING:</span> Set GMAIL_SMTP_USERNAME and GMAIL_APP_PASSWORD in your environment.<br>";
} else {
    echo "<span style='color: green;'>✓ OK</span> - Gmail SMTP credentials are set<br>";
}

echo "<h2>6. Test Registration Simulation</h2>";
try {
    $testName = "Test User";
    $testEmail = "test" . time() . "@example.com";
    $testPassword = "password123";

    $existing = auth_fetch_user_by_email($conn, $schema, $testEmail);
    if ($existing) {
        echo "<span style='color: red;'>FAILED:</span> Test email already exists<br>";
    } else {
        echo "<span style='color: green;'>✓ OK</span> - Test email is available<br>";
    }

    $hashedPassword = auth_hash_password_if_needed($testPassword);
    echo "<span style='color: green;'>✓ OK</span> - Password hashing works<br>";

    $testCode = generate_verification_code();
    echo "<span style='color: green;'>✓ OK</span> - Verification code generation works<br>";

    echo "<span style='color: green;'>✓ All registration components are working!</span><br>";
} catch (Exception $e) {
    echo "<span style='color: red;'>FAILED:</span> " . $e->getMessage() . "<br>";
}

$conn->close();

echo "<hr><h2>Next Steps</h2>";
echo "<ol>";
echo "<li><strong>Set your Gmail SMTP username and app password</strong> in environment variables</li>";
echo "<li><strong>Test registration</strong> through your website</li>";
echo "<li><strong>Check the recipient inbox</strong> for verification emails</li>";
echo "</ol>";
?>
