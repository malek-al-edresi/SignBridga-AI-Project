<?php
/**
 * SignBridga AI — DeepSeek API Proxy Endpoint
 * 
 * Accepts POST requests with JSON body: { "text": "Hello Thank You" }
 * Forwards the text to DeepSeek API for grammar/sentence refinement.
 * Returns JSON: { "refined": "...", "explanation": "..." }
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
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

// ─── Read and Validate Input ───
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!$input || !isset($input['text']) || !is_string($input['text'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid input. Expected JSON with a "text" field.']);
    exit;
}

$text = trim($input['text']);

// Sanitize: remove control characters, limit length
$text = preg_replace('/[\x00-\x1F\x7F]/u', '', $text);

if (strlen($text) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Text cannot be empty.']);
    exit;
}

if (strlen($text) > MAX_INPUT_LENGTH) {
    http_response_code(400);
    echo json_encode(['error' => 'Text exceeds maximum length of ' . MAX_INPUT_LENGTH . ' characters.']);
    exit;
}

// ─── Check if API key is configured ───
if (DEEPSEEK_API_KEY === 'YOUR_API_KEY_HERE' || empty(DEEPSEEK_API_KEY)) {
    // Return a helpful fallback instead of failing silently
    echo json_encode([
        'refined' => $text,
        'explanation' => 'AI refinement is not configured. The original text is shown. To enable AI, add your DeepSeek API key to api/config.php.'
    ]);
    exit;
}

// ─── Build DeepSeek API Request ───
$systemPrompt = 'You are a helpful assistant that refines sign language gesture sequences into natural, grammatically correct English sentences. '
    . 'The input is a series of gesture labels detected from sign language (e.g., "Hello Thank You Yes"). '
    . 'Your job is to convert them into a natural sentence. Keep it concise. '
    . 'Also provide a one-line explanation of how you refined it.';

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
        'error' => 'Failed to reach DeepSeek API. The service may be temporarily unavailable.',
        'refined' => $text,
    ]);
    exit;
}

$data = json_decode($response, true);

if (!$data || !isset($data['choices'][0]['message']['content'])) {
    // Return raw text as fallback
    http_response_code(200);
    echo json_encode([
        'refined' => $text,
        'explanation' => 'AI returned an unexpected response. Showing original text.',
    ]);
    exit;
}

$aiResponse = trim($data['choices'][0]['message']['content']);

// Try to parse structured response: "Refined: ... Explanation: ..."
$refined = $aiResponse;
$explanation = '';

if (preg_match('/(?:refined|sentence)[:\s]*(.+?)(?:\n|explanation|$)/i', $aiResponse, $m)) {
    $refined = trim($m[1], ' "\'.');
}
if (preg_match('/explanation[:\s]*(.+)/i', $aiResponse, $m)) {
    $explanation = trim($m[1], ' "\'.');
}

// If parsing didn't extract cleanly, use the whole response
if (empty($refined)) {
    $refined = $aiResponse;
}

echo json_encode([
    'refined' => $refined,
    'explanation' => $explanation,
]);
