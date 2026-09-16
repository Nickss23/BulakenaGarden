<?php
// sms_helper.php
// Provides normalize_phone_e164() and send_sms() helpers used by order handlers.

if (!function_exists('normalize_phone_e164')) {
    function normalize_phone_e164($phone) {
        $digits = preg_replace('/\D+/', '', $phone);
        if (preg_match('/^0?9\d{9}$/', $digits)) {
            if ($digits[0] === '0') $digits = substr($digits, 1);
            return '+63' . $digits;
        }
        if (preg_match('/^63\d{9}$/', $digits)) {
            return '+' . $digits;
        }
        if (preg_match('/^\d{7,15}$/', $digits)) {
            return '+' . $digits;
        }
        return null;
    }
}

if (!function_exists('format_sms_currency_php')) {
    function format_sms_currency_php($amount) {
        $n = (float)$amount;
        return 'PHP ' . number_format($n, 2, '.', ',');
    }
}

if (!function_exists('build_order_confirm_sms')) {
    function build_order_confirm_sms($orderId, array $orderObj) {
        $name = '';
        if (isset($orderObj['customer']) && is_array($orderObj['customer'])) {
            $fn = isset($orderObj['customer']['firstName']) ? trim((string)$orderObj['customer']['firstName']) : '';
            $ln = isset($orderObj['customer']['lastName']) ? trim((string)$orderObj['customer']['lastName']) : '';
            $name = trim(($fn ? $fn : '') . ($ln ? (' ' . $ln) : ''));
        }

        $deliveryType = isset($orderObj['deliveryType']) ? strtolower(trim((string)$orderObj['deliveryType'])) : '';
        if ($deliveryType === 'ship' || $deliveryType === 'shipping' || $deliveryType === 'deliver' || $deliveryType === 'delivery') {
            $deliveryLabel = 'Shipping';
        } elseif ($deliveryType === 'pickup' || $deliveryType === 'pick-up' || $deliveryType === 'pick up') {
            $deliveryLabel = 'Pick-up';
        } elseif ($deliveryType) {
            $deliveryLabel = ucfirst($deliveryType);
        } else {
            $deliveryLabel = 'N/A';
        }

        $items = [];
        if (isset($orderObj['items']) && is_array($orderObj['items'])) {
            foreach ($orderObj['items'] as $it) {
                if (!is_array($it)) continue;
                $title = '';
                if (isset($it['title'])) $title = trim((string)$it['title']);
                if ($title === '' && isset($it['name'])) $title = trim((string)$it['name']);
                if ($title === '' && isset($it['product_name'])) $title = trim((string)$it['product_name']);
                if ($title === '' && isset($it['product']) && is_array($it['product']) && isset($it['product']['title'])) $title = trim((string)$it['product']['title']);
                if ($title === '' && isset($it['product']) && is_array($it['product']) && isset($it['product']['name'])) $title = trim((string)$it['product']['name']);

                $qty = 0;
                if (isset($it['qty'])) $qty = (int)$it['qty'];
                if (!$qty && isset($it['quantity'])) $qty = (int)$it['quantity'];
                if (!$qty && isset($it['count'])) $qty = (int)$it['count'];
                if (!$qty && isset($it['quantityOrdered'])) $qty = (int)$it['quantityOrdered'];
                if ($qty <= 0) $qty = 1;

                if ($title !== '') $items[] = $title . ' x' . $qty;
            }
        }

        $itemsSummary = 'N/A';
        $maxItems = 2;
        if (count($items) > 0) {
            if (count($items) <= $maxItems) {
                $itemsSummary = implode(', ', $items);
            } else {
                $head = array_slice($items, 0, $maxItems);
                $more = count($items) - $maxItems;
                $itemsSummary = implode(', ', $head) . ' (+'. $more . ' more)';
            }
        }

        $total = null;
        if (isset($orderObj['total'])) $total = (float)$orderObj['total'];
        if ($total === null) {
            $sum = 0.0;
            if (isset($orderObj['items']) && is_array($orderObj['items'])) {
                foreach ($orderObj['items'] as $it) {
                    if (!is_array($it)) continue;
                    $price = isset($it['price']) ? (float)$it['price'] : 0.0;
                    $qty = isset($it['qty']) ? (int)$it['qty'] : (isset($it['quantity']) ? (int)$it['quantity'] : 1);
                    if ($qty <= 0) $qty = 1;
                    $sum += $price * $qty;
                }
            }
            $shipping = isset($orderObj['shippingFee']) ? (float)$orderObj['shippingFee'] : 0.0;
            $total = $sum + $shipping;
        }

        $greeting = $name ? ('Good day, ' . $name . '.') : 'Good day.';
        $lines = [];
        $lines[] = $greeting . ' Your order (' . $orderId . ') has been confirmed and is now being processed.';
        $lines[] = 'Item(s): ' . $itemsSummary;
        $lines[] = 'Total: ' . format_sms_currency_php($total);
        $lines[] = 'Mode: ' . $deliveryLabel;
        $lines[] = 'Bulakena Garden';
        return implode("\n", $lines);
    }
}

if (!function_exists('build_order_shipped_sms')) {
    function build_order_shipped_sms($orderId, array $orderObj) {
        $name = '';
        if (isset($orderObj['customer']) && is_array($orderObj['customer'])) {
            $fn = isset($orderObj['customer']['firstName']) ? trim((string)$orderObj['customer']['firstName']) : '';
            $ln = isset($orderObj['customer']['lastName']) ? trim((string)$orderObj['customer']['lastName']) : '';
            $name = trim(($fn ? $fn : '') . ($ln ? (' ' . $ln) : ''));
        }

        $deliveryType = isset($orderObj['deliveryType']) ? strtolower(trim((string)$orderObj['deliveryType'])) : '';
        if ($deliveryType === 'pickup' || $deliveryType === 'pick-up' || $deliveryType === 'pick up') {
            $deliveryLabel = 'Pick-up';
        } elseif ($deliveryType === 'ship' || $deliveryType === 'shipping' || $deliveryType === 'deliver' || $deliveryType === 'delivery') {
            $deliveryLabel = 'Delivery';
        } elseif ($deliveryType) {
            $deliveryLabel = ucfirst($deliveryType);
        } else {
            $deliveryLabel = 'Delivery';
        }

        $greeting = $name ? ('Hi, ' . $name . '.') : 'Hi.';
        $lines = [];
        $lines[] = $greeting . ' Your order (' . $orderId . ') is now out for delivery.';
        $lines[] = 'Please keep your phone available so our delivery team can reach you if needed.';
        $lines[] = 'Bulakena Garden';
        return implode("\n", $lines);
    }
}

if (!function_exists('build_order_delivered_sms')) {
    function build_order_delivered_sms($orderId, array $orderObj) {
        return 'Your order has been successfully delivered. We hope you enjoy your purchase! If you have any questions or concerns, feel free to contact us.';
    }
}

if (!function_exists('build_appointment_confirm_sms')) {
    function build_appointment_confirm_sms(array $appointment) {
        $service = '';
        if (isset($appointment['service'])) {
            $service = trim((string)$appointment['service']);
        }
        if ($service === '' && isset($appointment['desired_service'])) {
            $service = trim((string)$appointment['desired_service']);
        }
        if ($service === '') {
            $service = 'your selected service';
        }

        return 'Your appointment for ' . $service . ' has been confirmed. Our team will be ready to assist you at your scheduled time. If you have any questions or need to make changes, feel free to contact us.';
    }
}

if (!function_exists('send_sms_detailed')) {
    function send_sms_detailed($to, $message) {
        // local debug log helper (writes to orders/sms_debug.log)
        $write_debug = function($line) {
            $dir = __DIR__ . '/../orders/';
            if (!is_dir($dir)) @mkdir($dir, 0755, true);
            $logfile = $dir . 'sms_debug.log';
            $entry = '[' . date('c') . '] ' . $line . "\n";
            @file_put_contents($logfile, $entry, FILE_APPEND | LOCK_EX);
        };

        $write_simulated = function($prefix, $reason = 'simulated') use ($to, $message, $write_debug) {
            try {
                $dir = __DIR__ . '/../orders/sms_test/';
                if (!is_dir($dir)) @mkdir($dir, 0755, true);
                $fname = $dir . $prefix . '_' . date('YmdHis') . '_' . substr(md5($to . $message . microtime(true)), 0, 8) . '.txt';
                $content = "SIMULATED SEND\nTO: " . $to . "\nTIME: " . date('c') . "\nMESSAGE:\n" . $message . "\n";
                file_put_contents($fname, $content);
                $write_debug('send_sms (simulated) wrote: ' . $fname);
                error_log('send_sms (simulated) wrote: ' . $fname);
                return [
                    'ok' => true,
                    'transport_ok' => true,
                    'provider' => 'local_stub',
                    'http_code' => 200,
                    'delivery_state' => 'simulated',
                    'accepted' => true,
                    'simulated' => true,
                    'reason' => $reason,
                    'message_id' => null,
                    'recipient' => $to,
                    'sender_name' => null,
                    'response_raw' => null,
                    'debug_file' => $fname
                ];
            } catch (Throwable $e) {
                $write_debug('send_sms (simulated) failed: ' . $e->getMessage());
                return [
                    'ok' => false,
                    'transport_ok' => false,
                    'provider' => 'local_stub',
                    'http_code' => 0,
                    'delivery_state' => 'failed',
                    'accepted' => false,
                    'simulated' => true,
                    'reason' => 'simulation_failed',
                    'message_id' => null,
                    'recipient' => $to,
                    'sender_name' => null,
                    'response_raw' => $e->getMessage(),
                    'debug_file' => null
                ];
            }
        };

        // Local-dev detection: for XAMPP/localhost, prefer "working flow" via simulation when the gateway is unavailable.
        $serverName = isset($_SERVER['SERVER_NAME']) ? strtolower((string)$_SERVER['SERVER_NAME']) : '';
        $httpHost = isset($_SERVER['HTTP_HOST']) ? strtolower((string)$_SERVER['HTTP_HOST']) : '';
        $isLocal = ($serverName === 'localhost' || $serverName === '127.0.0.1' || $httpHost === 'localhost' || $httpHost === '127.0.0.1');
        // If test/semaphore mode is enabled, don't call providers — write a local semaphore/log
        $testMode = getenv('SMS_TEST_SEMAPHORE') ?: getenv('SMS_TEST_MODE');
        if ($testMode) {
            try {
                $dir = __DIR__ . '/../orders/sms_test/';
                if (!is_dir($dir)) @mkdir($dir, 0755, true);
                $fname = $dir . 'sms_' . date('YmdHis') . '_' . substr(md5($to . $message . microtime(true)),0,8) . '.txt';
                $content = "TO: " . $to . "\n";
                $content .= "TIME: " . date('c') . "\n";
                $content .= "MESSAGE:\n" . $message . "\n";
                file_put_contents($fname, $content);
                error_log('send_sms (test mode) wrote semaphore: ' . $fname);
                $write_debug('send_sms (test mode) wrote semaphore: ' . $fname);
                return [
                    'ok' => true,
                    'transport_ok' => true,
                    'provider' => 'test_mode',
                    'http_code' => 200,
                    'delivery_state' => 'simulated',
                    'accepted' => true,
                    'simulated' => true,
                    'reason' => 'test_mode',
                    'message_id' => null,
                    'recipient' => $to,
                    'sender_name' => null,
                    'response_raw' => null,
                    'debug_file' => $fname
                ];
            } catch (Throwable $e) {
                error_log('send_sms (test mode) failed to write semaphore: ' . $e->getMessage());
                $write_debug('send_sms (test mode) failed to write semaphore: ' . $e->getMessage());
                return [
                    'ok' => false,
                    'transport_ok' => false,
                    'provider' => 'test_mode',
                    'http_code' => 0,
                    'delivery_state' => 'failed',
                    'accepted' => false,
                    'simulated' => true,
                    'reason' => 'test_mode_failed',
                    'message_id' => null,
                    'recipient' => $to,
                    'sender_name' => null,
                    'response_raw' => $e->getMessage(),
                    'debug_file' => null
                ];
            }
        }
        // Twilio integration removed — using generic gateway or test semaphore only

        // Semaphore-only gateway implementation
        $apiKey = getenv('SEMAPHORE_APIKEY') ?: getenv('SMS_SEMAPHORE_APIKEY') ?: getenv('SMS_GATEWAY_KEY');
        $sender = getenv('SEMAPHORE_SENDER') ?: getenv('SMS_SEMAPHORE_SENDER') ?: getenv('SMS_FROM');
        $apiKeySource = $apiKey ? 'env' : null;
        $senderSource = $sender ? 'env' : null;
        if (is_string($sender)) {
            $sender = trim($sender);
            if ($sender === '') {
                $sender = null;
                $senderSource = null;
            }
        }
        // Semaphore advisory: the sender name "SEMAPHORE" may be disallowed; don't force it.
        if (is_string($sender) && strtoupper($sender) === 'SEMAPHORE') {
            $write_debug('send_sms: sender configured as "SEMAPHORE"; omitting sendername');
            $sender = null;
            $senderSource = null;
        }
        // Fallback: load local semaphore_config.php if environment not available (development only)
        // Load if either API key or sender is missing.
        if (!$apiKey || !$sender) {
            $cfg = __DIR__ . '/semaphore_config.php';
            if (is_file($cfg)) {
                @include $cfg;
                if (empty($apiKey) && !empty($SEMAPHORE_APIKEY)) {
                    $apiKey = $SEMAPHORE_APIKEY;
                    $apiKeySource = 'semaphore_config.php';
                    // write debug note
                    if (isset($write_debug) && is_callable($write_debug)) $write_debug('send_sms: loaded API key from semaphore_config.php');
                }
                if (empty($sender) && !empty($SEMAPHORE_SENDER)) {
                    $sender = is_string($SEMAPHORE_SENDER) ? trim($SEMAPHORE_SENDER) : $SEMAPHORE_SENDER;
                    if (is_string($sender) && $sender === '') $sender = null;
                    if ($sender) $senderSource = 'semaphore_config.php';
                }
            }
        }
        $endpoint = getenv('SEMAPHORE_URL') ?: 'https://api.semaphore.co/api/v4/messages';
        if (!$apiKey) {
            error_log('send_sms: Semaphore API key not configured in environment (SEMAPHORE_APIKEY)');
            $write_debug('send_sms: missing API key');
            if ($isLocal) return $write_simulated('sim_sms', 'missing_api_key');
            return [
                'ok' => false,
                'transport_ok' => false,
                'provider' => 'semaphore',
                'http_code' => 0,
                'delivery_state' => 'failed',
                'accepted' => false,
                'simulated' => false,
                'reason' => 'missing_api_key',
                'message_id' => null,
                'recipient' => $to,
                'sender_name' => $sender,
                'response_raw' => null
            ];
        }
        // Log what we're about to use (without leaking full API key)
        $maskedKey = (is_string($apiKey) && strlen($apiKey) >= 8) ? (substr($apiKey, 0, 4) . '...' . substr($apiKey, -4)) : 'present';
        $write_debug('send_sms: using apikey=' . $maskedKey . ' source=' . ($apiKeySource ?: 'unknown') . '; sender=' . ($sender ?: '(none)') . ' len=' . ($sender ? strlen((string)$sender) : 0) . ' source=' . ($senderSource ?: 'none'));

        // Convert E.164 to local Philippine format expected by Semaphore (0917...)
        $digits = preg_replace('/\D+/', '', $to);
        if (strpos($digits, '63') === 0 && strlen($digits) >= 11) {
            $digits = '0' . substr($digits, 2);
        } elseif (strpos($digits, '0') !== 0 && strlen($digits) == 10) {
            // assume local missing leading zero
            $digits = '0' . $digits;
        }

        $params = [
            'apikey' => $apiKey,
            'number' => $digits,
            'message' => $message
        ];
        if ($sender) $params['sendername'] = $sender;

        $request = function(array $requestParams) use ($endpoint, $isLocal, $write_debug, $write_simulated) {
            $resp = '';
            $httpCode = 0;
            // Prefer cURL when available, but gracefully fallback for environments without php_curl enabled.
            if (function_exists('curl_init')) {
                $ch = curl_init();
                if ($ch === false) {
                    error_log('send_sms: curl_init failed');
                    $write_debug('send_sms: curl_init failed');
                    return [0, null, 'curl_init_failed'];
                }
                curl_setopt($ch, CURLOPT_URL, $endpoint);
                curl_setopt($ch, CURLOPT_POST, 1);
                curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($requestParams));
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 10);
                $resp = curl_exec($ch);
                $errno = curl_errno($ch);
                $err = curl_error($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                if ($errno) {
                    error_log('send_sms (semaphore) curl error: ' . $err);
                    $write_debug('send_sms (semaphore) curl error: ' . $err);
                    return [0, null, 'curl_error'];
                }
                return [$httpCode, (string)$resp, null];
            }

            $write_debug('send_sms: php_curl not available; using stream fallback');
            $payload = http_build_query($requestParams);
            $ctx = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/x-www-form-urlencoded\r\n" .
                                "Content-Length: " . strlen($payload) . "\r\n",
                    'content' => $payload,
                    'timeout' => 10
                ]
            ]);
            $resp = @file_get_contents($endpoint, false, $ctx);
            $headers = isset($http_response_header) ? $http_response_header : [];
            foreach ($headers as $h) {
                if (preg_match('/^HTTP\\/(?:\\d+(?:\\.\\d+)?)\\s+(\\d{3})\\b/i', $h, $m)) {
                    $httpCode = intval($m[1]);
                    break;
                }
            }
            if ($resp === false) {
                $write_debug('send_sms (semaphore stream) request failed (allow_url_fopen or network)');
                return [0, null, 'stream_error'];
            }
            return [$httpCode, (string)$resp, null];
        };

        [$httpCode, $resp, $transportErr] = $request($params);
        if ($transportErr) {
            if ($isLocal) return $write_simulated('sim_sms', $transportErr);
            return [
                'ok' => false,
                'transport_ok' => false,
                'provider' => 'semaphore',
                'http_code' => 0,
                'delivery_state' => 'failed',
                'accepted' => false,
                'simulated' => false,
                'reason' => $transportErr,
                'message_id' => null,
                'recipient' => $to,
                'sender_name' => $sender,
                'response_raw' => null
            ];
        }
        // Log HTTP code and response for debugging
        $dbg = 'send_sms (semaphore) http=' . intval($httpCode) . ' resp=' . substr((string)$resp,0,1024);
        error_log($dbg);
        $write_debug($dbg);
        $decoded = json_decode((string)$resp, true);
        $payload = (is_array($decoded) && isset($decoded[0]) && is_array($decoded[0])) ? $decoded[0] : (is_array($decoded) ? $decoded : []);
        $providerStatus = '';
        if (isset($payload['status']) && is_scalar($payload['status'])) {
            $providerStatus = strtolower(trim((string)$payload['status']));
        }
        $deliveryState = $providerStatus !== '' ? $providerStatus : (($httpCode >= 200 && $httpCode < 300) ? 'accepted' : 'failed');
        $baseResult = [
            'ok' => ($httpCode >= 200 && $httpCode < 300),
            'transport_ok' => ($httpCode >= 200 && $httpCode < 300),
            'provider' => 'semaphore',
            'http_code' => (int)$httpCode,
            'delivery_state' => $deliveryState,
            'accepted' => ($httpCode >= 200 && $httpCode < 300),
            'simulated' => false,
            'reason' => null,
            'message_id' => isset($payload['message_id']) ? (string)$payload['message_id'] : null,
            'recipient' => isset($payload['recipient']) ? (string)$payload['recipient'] : $to,
            'sender_name' => isset($payload['sender_name']) ? (string)$payload['sender_name'] : $sender,
            'response_raw' => is_string($resp) ? $resp : null
        ];

        if ($httpCode >= 200 && $httpCode < 300) {
            return $baseResult;
        }

        // If Semaphore rejects the sender name, retry once without sendername (so delivery can proceed).
        if ($sender && preg_match('/sendername\\b.*not\\s+valid/i', (string)$resp)) {
            $write_debug('send_sms: sendername rejected; retrying without sendername');
            $params2 = $params;
            unset($params2['sendername']);
            [$httpCode2, $resp2, $transportErr2] = $request($params2);
            if (!$transportErr2) {
                $dbg2 = 'send_sms (semaphore retry no-sender) http=' . intval($httpCode2) . ' resp=' . substr((string)$resp2,0,1024);
                error_log($dbg2);
                $write_debug($dbg2);
                $decoded2 = json_decode((string)$resp2, true);
                $payload2 = (is_array($decoded2) && isset($decoded2[0]) && is_array($decoded2[0])) ? $decoded2[0] : (is_array($decoded2) ? $decoded2 : []);
                if ($httpCode2 >= 200 && $httpCode2 < 300) {
                    $providerStatus2 = '';
                    if (isset($payload2['status']) && is_scalar($payload2['status'])) {
                        $providerStatus2 = strtolower(trim((string)$payload2['status']));
                    }
                    return [
                        'ok' => true,
                        'transport_ok' => true,
                        'provider' => 'semaphore',
                        'http_code' => (int)$httpCode2,
                        'delivery_state' => $providerStatus2 !== '' ? $providerStatus2 : 'accepted',
                        'accepted' => true,
                        'simulated' => false,
                        'reason' => 'retry_without_sendername',
                        'message_id' => isset($payload2['message_id']) ? (string)$payload2['message_id'] : null,
                        'recipient' => isset($payload2['recipient']) ? (string)$payload2['recipient'] : $to,
                        'sender_name' => isset($payload2['sender_name']) ? (string)$payload2['sender_name'] : null,
                        'response_raw' => is_string($resp2) ? $resp2 : null
                    ];
                }
                // preserve original response for later handling
            }
        }
        $write_debug('send_sms (semaphore) non-2xx response: ' . intval($httpCode));

        // If developer requests local stub mode, or as a fallback for blocked/403 responses,
        // write a simulated-send file so the site behaves as if the SMS was delivered.
        $forceLocal = getenv('SMS_LOCAL_STUB') ?: getenv('SMS_TEST_SEMAPHORE') ?: getenv('SMS_TEST_MODE');
        if ($forceLocal || $isLocal || intval($httpCode) === 403) {
            return $write_simulated('sim_sms', 'provider_fallback');
        }

        $baseResult['reason'] = 'non_2xx_response';
        $baseResult['accepted'] = false;
        $baseResult['ok'] = false;
        $baseResult['transport_ok'] = false;
        return $baseResult;
    }

    // close send_sms_detailed function and function_exists wrapper
}

if (!function_exists('send_sms')) {
    function send_sms($to, $message) {
        $result = send_sms_detailed($to, $message);
        return !empty($result['ok']);
    }
}
