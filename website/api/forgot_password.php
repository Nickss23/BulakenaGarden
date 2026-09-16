<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth_common.php';
require_once __DIR__ . '/../../includes/gmail_smtp_config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    auth_respond_json(405, ['success' => false, 'message' => 'Method not allowed. Use POST.']);
}

$email = auth_normalize_email((string) ($_POST['email'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_respond_json(422, ['success' => false, 'message' => 'Please provide a valid email.']);
}

try {
    require_once __DIR__ . '/../../includes/config.php';
    $schema = auth_get_user_schema($conn);
    if ($schema['password'] === null) {
        auth_respond_json(500, ['success' => false, 'message' => 'The users table does not support passwords.']);
    }

    $userRow = auth_fetch_user_by_email($conn, $schema, $email);
    if (!$userRow) {
        auth_respond_json(200, ['success' => true, 'message' => 'If an account exists for that email, a reset code has been sent.']);
    }

    $resetCode = generate_verification_code();
    auth_start_session();
    $_SESSION['pending_password_reset'] = [
        'email' => $email,
        'code' => $resetCode,
        'expires' => time() + (15 * 60),
    ];

    $name = (string) ($userRow['full_name'] ?? 'Customer');
    $subject = 'Reset Your Password - Bulakena Garden';
    $htmlBody = '
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c3e50;">Password Reset Request</h2>
                <p>Hello ' . htmlspecialchars($name) . ',</p>
                <p>We received a request to reset your password. Use the code below to continue:</p>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
                    <p style="margin: 0; font-size: 14px; color: #666;">Your Reset Code:</p>
                    <p style="margin: 10px 0; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #27ae60;">' . htmlspecialchars($resetCode) . '</p>
                </div>
                <p style="color: #e74c3c; font-size: 14px;">This code expires in ' . VERIFICATION_CODE_EXPIRY_MINUTES . ' minutes.</p>
                <p>If you did not request this reset, you can safely ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                <p style="font-size: 12px; color: #999;">Bulakena Garden | ' . date('Y') . '</p>
            </div>
        </body>
        </html>
    ';
    $textBody = "Password Reset Request\n\n"
        . "Hello " . $name . ",\n\n"
        . "Your reset code is: " . $resetCode . "\n\n"
        . "This code expires in " . VERIFICATION_CODE_EXPIRY_MINUTES . " minutes.\n\n"
        . "If you did not request this reset, you can ignore this email.";

    $emailSent = send_gmail_email($email, $name, $subject, $htmlBody, $textBody);

    auth_respond_json(200, [
        'success' => true,
        'message' => $emailSent
            ? 'A reset code has been sent to your email.'
            : 'A reset code could not be sent right now, but the reset step is ready.',
        'email_sent' => $emailSent,
    ]);
} catch (Throwable $e) {
    auth_respond_json(500, ['success' => false, 'message' => 'Server error while requesting password reset.', 'error' => $e->getMessage()]);
}
