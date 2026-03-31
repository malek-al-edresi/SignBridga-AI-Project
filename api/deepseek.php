<?php
/**
 * SignBridga AI — DeepSeek API Proxy Endpoint
 * 
 * Accepts POST requests with JSON body: { "text": "Hello Thank You" }
 * Forwards the text to DeepSeek API for grammar/sentence refinement.
 * Returns JSON: { "success": bool, "result": "...", "raw": "...", "error": null|"..." }
 * 
 * This endpoint is OPTIONAL — the frontend works fully without it.
 * It exists to demonstrate secure server-side API key handling.
 */

// ─── Load Configuration ───
require_once __DIR__ . '/config.php';

// ─── CORS Headers ───
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── Only accept POST ───
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'result'  => null,
        'raw'     => null,
        'error'   => 'Method not allowed. Use POST.',
    ]);
    exit;
}

// ─── Read and Validate Input ───
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!$input || !isset($input['text']) || !is_string($input['text'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'result'  => null,
        'raw'     => null,
        'error'   => 'Invalid input. Expected JSON with a "text" field.',
    ]);
    exit;
}

$text = trim($input['text']);

// Sanitize: remove control characters, limit length
$text = preg_replace('/[\x00-\x1F\x7F]/u', '', $text);

if (strlen($text) === 0) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'result'  => null,
        'raw'     => null,
        'error'   => 'Text cannot be empty.',
    ]);
    exit;
}

if (strlen($text) > MAX_INPUT_LENGTH) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'result'  => null,
        'raw'     => $text,
        'error'   => 'Text exceeds maximum length of ' . MAX_INPUT_LENGTH . ' characters.',
    ]);
    exit;
}

// ─── Check if API key is configured ───
if (DEEPSEEK_API_KEY === 'YOUR_API_KEY_HERE' || empty(DEEPSEEK_API_KEY)) {
    // Return a helpful fallback instead of failing silently
    echo json_encode([
        'success' => true,
        'result'  => $text,
        'raw'     => $text,
        'error'   => null,
    ]);
    exit;
}

// ─── Build DeepSeek API Request ───
$systemPrompt = 'You are a helpful assistant that refines sign language gesture sequences into natural, grammatically correct English sentences. '
    . 'The input is a series of gesture labels detected from sign language (e.g., "Hello Thank You Yes"). '
    . 'Your job is to convert them into a natural sentence. Keep it concise. '
    . 'Return ONLY the refined sentence, nothing else.';

$payload = json_encode([
    'model' => DEEPSEEK_MODEL,
    'messages' => [
        ['role' => 'system', 'content' => $systemPrompt],
        ['role' => 'user', 'content' => 'Refine this gesture sequence into a natural sentence: "' . $text . '"']
    ],
    'temperature' => 0.7,
    'max_tokens' => 150,
]);

// ─── Send Request via file_get_contents (no cURL dependency) ───
$httpOptions = [
    'http' => [
        'method' => 'POST',
        'header' => implode("\r\n", [
            'Content-Type: application/json',
            'Authorization: Bearer ' . DEEPSEEK_API_KEY,
            'Content-Length: ' . strlen($payload),
        ]),
        'content' => $payload,
        'timeout' => 15,
        'ignore_errors' => true,
    ],
];

$context = stream_context_create($httpOptions);
$response = @file_get_contents(DEEPSEEK_API_URL, false, $context);

// ─── Handle Response ───
if ($response === false) {
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'result'  => $text,
        'raw'     => $text,
        'error'   => 'Failed to reach DeepSeek API. The service may be temporarily unavailable.',
    ]);
    exit;
}

$data = json_decode($response, true);

if (!$data || !isset($data['choices'][0]['message']['content'])) {
    // Return raw text as fallback
    echo json_encode([
        'success' => true,
        'result'  => $text,
        'raw'     => $text,
        'error'   => null,
    ]);
    exit;
}

$aiResponse = trim($data['choices'][0]['message']['content']);

// Clean up common AI response artifacts (quotes, "Refined:" prefix, etc.)
$refined = $aiResponse;
$refined = preg_replace('/^(?:refined|sentence)[:\s]*/i', '', $refined);
$refined = trim($refined, ' "\'.');

if (empty($refined)) {
    $refined = $text; // fallback to original
}

echo json_encode([
    'success' => true,
    'result'  => $refined,
    'raw'     => $text,
    'error'   => null,
]);
