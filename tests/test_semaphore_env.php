<?php
header('Content-Type: application/json; charset=utf-8');
$apiEnv = getenv('SEMAPHORE_APIKEY') ?: getenv('SMS_SEMAPHORE_APIKEY') ?: getenv('SMS_GATEWAY_KEY') ?: '';
$senderEnv = getenv('SEMAPHORE_SENDER') ?: getenv('SMS_SEMAPHORE_SENDER') ?: getenv('SMS_FROM') ?: '';
$api = $apiEnv;
$sender = $senderEnv;
$apiSource = $api ? 'env' : null;
$senderSource = $sender ? 'env' : null;
if (is_string($sender)) {
    $sender = trim($sender);
    if ($sender === '') {
        $sender = null;
        $senderSource = null;
    }
}
// Keep behavior consistent with sms_helper.php: treat "SEMAPHORE" as an invalid/unwanted configured sender.
$senderIgnored = false;
if (is_string($sender) && strtoupper($sender) === 'SEMAPHORE') {
    $senderIgnored = true;
    $sender = null;
    $senderSource = null;
}
// Mirror sms_helper.php fallback behavior for local development.
if (!$api || !$sender) {
    $cfg = __DIR__ . '/../includes/semaphore_config.php';
    if (is_file($cfg)) {
        @include $cfg;
        if (!$api && !empty($SEMAPHORE_APIKEY)) {
            $api = $SEMAPHORE_APIKEY;
            $apiSource = 'semaphore_config.php';
        }
        if (!$sender && !empty($SEMAPHORE_SENDER)) {
            $sender = is_string($SEMAPHORE_SENDER) ? trim($SEMAPHORE_SENDER) : $SEMAPHORE_SENDER;
            if (is_string($sender) && $sender === '') $sender = null;
            if ($sender) $senderSource = 'semaphore_config.php';
        }
    }
}
$test = getenv('SMS_TEST_SEMAPHORE') ?: getenv('SMS_TEST_MODE') ?: '';
function mask_key($k){
    if (!$k) return null;
    $len = strlen($k);
    if ($len <= 8) return substr($k,0,2) . '****' . substr($k,-2);
    return substr($k,0,4) . '...' . substr($k,-4);
}
$out = [
    'env_semaphore_api_present' => $apiEnv ? true : false,
    'env_semaphore_api_masked' => mask_key($apiEnv),
    'env_semaphore_sender' => is_string($senderEnv) ? trim($senderEnv) : ($senderEnv ?: null),
    'resolved_semaphore_api_present' => $api ? true : false,
    'resolved_semaphore_api_masked' => mask_key($api),
    'resolved_semaphore_api_source' => $apiSource ?: null,
    'resolved_semaphore_sender' => $sender ?: null,
    'resolved_semaphore_sender_source' => $senderSource ?: null,
    'resolved_sender_ignored_env_semaphore' => $senderIgnored ? true : false,
    'sms_test_mode' => $test ? true : false
];
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
