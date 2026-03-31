<?php
/**
 * SignBridga AI — Configuration File
 * 
 * Store sensitive configuration values here.
 * This file should NEVER be publicly accessible or committed with real keys.
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Copy this file to your server's api/ directory.
 * 2. Replace 'YOUR_API_KEY_HERE' with your actual DeepSeek API key.
 * 3. Ensure this file is NOT accessible directly via URL.
 *    On InfinityFree, files in subdirectories are fine — just don't link to config.php.
 */

// ─── DeepSeek API Configuration ───
define('DEEPSEEK_API_KEY', 'sk-f8455753976a4cdbaf7ce27c648a0bcf');  // <-- Insert your real API key here (never commit it)
define('DEEPSEEK_API_URL', 'https://api.deepseek.com/v1/chat/completions');
define('DEEPSEEK_MODEL', 'deepseek-chat');

// ─── Security ───
define('MAX_INPUT_LENGTH', 500); // Max characters accepted from frontend
define('ALLOWED_ORIGIN', '*');   // Change to your domain in production, e.g. 'https://yourdomain.infinityfreeapp.com'
