<?php
// Debug the request
header('Content-Type: application/json; charset=utf-8');

$input = file_get_contents('php://input');
$decoded = json_decode($input, true);

echo json_encode([
    'raw_input' => substr($input, 0, 200),
    'input_length' => strlen($input),
    'decoded' => $decoded,
    'is_array' => is_array($decoded)
]);
