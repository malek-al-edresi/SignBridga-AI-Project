/* =============================================================
   SignBridga AI — Main Application Logic
   Camera, MediaPipe Hands, Gesture Recognition, TTS, Demo Mode
   ============================================================= */

(function () {
    'use strict';

    // ─────────────────────────────────────────────
    // 1. DOM References
    // ─────────────────────────────────────────────
    const DOM = {
        video: document.getElementById('cameraFeed'),
        canvas: document.getElementById('landmarkCanvas'),
        placeholder: document.getElementById('cameraPlaceholder'),
        viewport: document.getElementById('cameraViewport'),
        startBtn: document.getElementById('startCameraBtn'),
        stopBtn: document.getElementById('stopCameraBtn'),
        demoBtn: document.getElementById('demoModeBtn'),
        clearBtn: document.getElementById('clearBtn'),
        gestureEmoji: document.getElementById('gestureEmoji'),
        gestureLabel: document.getElementById('gestureLabel'),
        gestureDisplay: document.getElementById('gestureDisplay'),
        gestureCard: document.getElementById('gestureCard'),
        confidenceValue: document.getElementById('confidenceValue'),
        confidenceFill: document.getElementById('confidenceFill'),
        translatedText: document.getElementById('translatedText'),
        speechLog: document.getElementById('speechLog'),
        detectionIndicator: document.getElementById('detectionIndicator'),
        detectionStatusText: document.getElementById('detectionStatusText'),
        refineBtn: document.getElementById('refineBtn'),
        refinedOutput: document.getElementById('refinedOutput'),
        speakAllBtn: document.getElementById('speakAllBtn'),
        navbar: document.getElementById('navbar'),
        navToggle: document.getElementById('navToggle'),
        navLinks: document.getElementById('navLinks'),
    };

    const ctx = DOM.canvas.getContext('2d');

    // ─────────────────────────────────────────────
    // 2. State
    // ─────────────────────────────────────────────
    const state = {
        cameraActive: false,
        demoActive: false,
        stream: null,
        hands: null,
        animationId: null,
        // Stabilization
        buffer: [],
        bufferSize: 5,
        requiredAgreement: 3,
        lastStableGesture: null,
        speechCooldown: false,
        cooldownMs: 800,
        // Translated text
        words: [],
        // Demo
        demoInterval: null,
        demoIndex: 0,
        // Auto-refine with DeepSeek
        autoRefineTimer: null,
        autoRefineDelayMs: 3000,
        lastAutoRefineTime: 0,
        lastAutoRefineText: '',
        autoRefineMinIntervalMs: 10000,
    };

    // ─────────────────────────────────────────────
    // 3. Gesture Definitions
    // ─────────────────────────────────────────────
    const GESTURES = {
        hello:      { label: 'Hello',       emoji: '👋',  description: 'Open hand, all fingers extended' },
        yes:        { label: 'Yes',         emoji: '👍',  description: 'Thumbs up' },
        no:         { label: 'No',          emoji: '👎',  description: 'Thumbs down' },
        help:       { label: 'Help',        emoji: '🆘',  description: 'Fist with thumb raised on palm' },
        thankyou:   { label: 'Thank You',   emoji: '🙏',  description: 'Flat hand forward' },
        iloveyou:   { label: 'I Love You',  emoji: '🤟',  description: 'Thumb + index + pinky extended' },
        stop:       { label: 'Stop',        emoji: '✋',  description: 'Palm forward, fingers together' },
        peace:      { label: 'Peace',       emoji: '✌️',  description: 'V sign — index + middle up' },
    };

    // MediaPipe landmark indices
    // Wrist: 0
    // Thumb:  1-4  (CMC, MCP, IP, TIP)
    // Index:  5-8  (MCP, PIP, DIP, TIP)
    // Middle: 9-12
    // Ring:   13-16
    // Pinky:  17-20

    // ─────────────────────────────────────────────
    // 4. Landmark Utility Functions
    // ─────────────────────────────────────────────

    /**
     * Calculate Euclidean distance between two landmarks.
     */
    function dist(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
    }

    /**
     * Compute palm size for distance normalization.
     * Uses wrist (0) to middle-finger MCP (9) as reference.
     */
    function palmSize(landmarks) {
        return dist(landmarks[0], landmarks[9]) || 0.001; // avoid div-by-zero
    }

    /**
     * Determine if a finger is extended.
     * For thumb: uses joint-chain direction (TIP farther from MCP than IP is from MCP).
     * For other fingers: compare TIP y < PIP y.
     */
    function isFingerExtended(landmarks, finger) {
        if (finger === 'thumb') {
            const cmc = landmarks[1];
            const mcp = landmarks[2];
            const ip  = landmarks[3];
            const tip = landmarks[4];
            // Thumb is extended when TIP is farther from CMC than IP is
            const tipDist = dist(tip, cmc);
            const ipDist  = dist(ip, cmc);
            return tipDist > ipDist;
        }

        const tipIndices = { index: 8, middle: 12, ring: 16, pinky: 20 };
        const pipIndices = { index: 6, middle: 10, ring: 14, pinky: 18 };

        const tip = landmarks[tipIndices[finger]];
        const pip = landmarks[pipIndices[finger]];

        // In normalized coords, y=0 is top of image, so extended = tip.y < pip.y
        return tip.y < pip.y;
    }

    /**
     * Check if thumb is pointing up vs down.
     */
    function isThumbUp(landmarks) {
        const thumbTip = landmarks[4];
        const thumbMcp = landmarks[2];
        return thumbTip.y < thumbMcp.y; // tip above MCP = up
    }

    /**
     * Check if fingers are spread apart (normalized by palm size).
     */
    function areFingersSpread(landmarks) {
        const ps = palmSize(landmarks);
        const d1 = dist(landmarks[8], landmarks[12]) / ps;
        const d2 = dist(landmarks[12], landmarks[16]) / ps;
        const d3 = dist(landmarks[16], landmarks[20]) / ps;

        return (d1 > 0.15 && d2 > 0.12 && d3 > 0.12);
    }

    /**
     * Check if fingers are close together (normalized by palm size).
     */
    function areFingersTogether(landmarks) {
        const ps = palmSize(landmarks);
        const d1 = dist(landmarks[8], landmarks[12]) / ps;
        const d2 = dist(landmarks[12], landmarks[16]) / ps;
        const d3 = dist(landmarks[16], landmarks[20]) / ps;

        return (d1 < 0.22 && d2 < 0.22 && d3 < 0.22);
    }

    // ─────────────────────────────────────────────
    // 5. Gesture Recognition Engine
    // ─────────────────────────────────────────────

    /**
     * Recognize gesture from 21 hand landmarks.
     * Returns a gesture key (e.g., 'hello') or null.
     * Order: most specific patterns first → generic last.
     */
    function recognizeGesture(landmarks) {
        if (!landmarks || landmarks.length < 21) return null;

        const thumb  = isFingerExtended(landmarks, 'thumb');
        const index  = isFingerExtended(landmarks, 'index');
        const middle = isFingerExtended(landmarks, 'middle');
        const ring   = isFingerExtended(landmarks, 'ring');
        const pinky  = isFingerExtended(landmarks, 'pinky');

        const extendedCount = [thumb, index, middle, ring, pinky].filter(Boolean).length;
        const thumbUp  = isThumbUp(landmarks);
        const spread   = areFingersSpread(landmarks);
        const together = areFingersTogether(landmarks);

        // ── I Love You: thumb + index + pinky, NOT middle, NOT ring ──
        if (thumb && index && !middle && !ring && pinky) {
            return 'iloveyou';
        }

        // ── Peace: index + middle only (thumb may or may not be out) ──
        if (index && middle && !ring && !pinky && extendedCount <= 3) {
            return 'peace';
        }

        // ── Help: thumb + index only (two fingers, fist-like) ──
        if (thumb && index && !middle && !ring && !pinky) {
            return 'help';
        }

        // ── Yes: only thumb extended, pointing up ──
        if (thumb && !index && !middle && !ring && !pinky && thumbUp) {
            return 'yes';
        }

        // ── No: only thumb extended, pointing down ──
        if (thumb && !index && !middle && !ring && !pinky && !thumbUp) {
            return 'no';
        }

        // ── All five fingers extended ──
        if (extendedCount === 5) {
            if (together) {
                return 'stop'; // Palm forward, fingers together
            }
            return 'hello'; // Open hand (spread or default)
        }

        // ── Thank You: four fingers extended (not thumb) ──
        if (!thumb && index && middle && ring && pinky) {
            return 'thankyou';
        }

        return null;
    }

    // ─────────────────────────────────────────────
    // 6. Stabilization Buffer
    // ─────────────────────────────────────────────

    /**
     * Push a recognition result into the buffer and determine
     * if a stable gesture has been reached.
     */
    function pushToBuffer(gestureKey) {
        state.buffer.push(gestureKey);
        if (state.buffer.length > state.bufferSize) {
            state.buffer.shift();
        }

        // Count occurrences
        const counts = {};
        state.buffer.forEach(g => {
            if (g) counts[g] = (counts[g] || 0) + 1;
        });

        // Find dominant gesture
        let dominant = null;
        let maxCount = 0;
        for (const key in counts) {
            if (counts[key] > maxCount) {
                maxCount = counts[key];
                dominant = key;
            }
        }

        const stability = state.buffer.length > 0 ? maxCount / state.buffer.length : 0;
        updateConfidence(Math.round(stability * 100));

        if (maxCount >= state.requiredAgreement && dominant) {
            return { gesture: dominant, stability: stability };
        }

        return { gesture: null, stability: stability };
    }

    // ─────────────────────────────────────────────
    // 7. UI Update Functions
    // ─────────────────────────────────────────────

    function updateGestureDisplay(gestureKey) {
        if (gestureKey && GESTURES[gestureKey]) {
            const g = GESTURES[gestureKey];
            DOM.gestureEmoji.textContent = g.emoji;
            DOM.gestureLabel.textContent = g.label;
            DOM.gestureDisplay.classList.add('active');
            DOM.gestureCard.style.borderColor = 'rgba(56, 189, 248, 0.35)';
        } else {
            DOM.gestureEmoji.textContent = '—';
            DOM.gestureLabel.textContent = 'No gesture detected';
            DOM.gestureDisplay.classList.remove('active');
            DOM.gestureCard.style.borderColor = '';
        }
    }

    function updateConfidence(percent) {
        DOM.confidenceValue.textContent = percent + '%';
        DOM.confidenceFill.style.width = percent + '%';

        // Color based on stability
        if (percent >= 70) {
            DOM.confidenceFill.style.background = 'linear-gradient(90deg, #34d399, #38bdf8)';
        } else if (percent >= 40) {
            DOM.confidenceFill.style.background = 'linear-gradient(90deg, #fbbf24, #38bdf8)';
        } else {
            DOM.confidenceFill.style.background = 'linear-gradient(90deg, #f87171, #fbbf24)';
        }
    }

    function addToTranslatedText(word) {
        state.words.push(word);
        DOM.translatedText.innerHTML = '';

        const textNode = document.createElement('span');
        textNode.textContent = state.words.join(' ');
        DOM.translatedText.appendChild(textNode);

        // Highlight latest word briefly
        textNode.style.animation = 'fadeInUp 0.4s var(--ease-out)';

        // Enable refine button
        DOM.refineBtn.disabled = false;
    }

    function addToSpeechLog(word) {
        // Remove placeholder
        const placeholder = DOM.speechLog.querySelector('.log-placeholder');
        if (placeholder) placeholder.remove();

        const li = document.createElement('li');
        li.className = 'spoken';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        li.textContent = `${word} — ${time}`;
        DOM.speechLog.prepend(li);

        // Keep log manageable
        while (DOM.speechLog.children.length > 20) {
            DOM.speechLog.lastChild.remove();
        }
    }

    function setDetectionStatus(text, detecting) {
        DOM.detectionIndicator.classList.toggle('detecting', detecting);
        DOM.detectionIndicator.classList.add('visible');
        DOM.detectionStatusText.textContent = text;
        DOM.viewport.classList.toggle('detecting', detecting);
    }

    // ─────────────────────────────────────────────
    // 8. Text-to-Speech
    // ─────────────────────────────────────────────

    function speak(text) {
        if (!('speechSynthesis' in window)) return;
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1;

        // Try to pick a good voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
        if (preferred) utterance.voice = preferred;

        window.speechSynthesis.speak(utterance);
    }

    // Ensure voices are loaded
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = function () {
            window.speechSynthesis.getVoices();
        };
    }

    // ─────────────────────────────────────────────
    // 9. MediaPipe Hands Integration
    // ─────────────────────────────────────────────

    function initMediaPipeHands() {
        if (typeof Hands === 'undefined') {
            console.error('MediaPipe Hands library not loaded.');
            setDetectionStatus('MediaPipe not loaded', false);
            return null;
        }

        const hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5,
        });

        hands.onResults(onHandResults);

        return hands;
    }

    function onHandResults(results) {
        // Clear canvas
        ctx.clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            // Draw landmarks and connections
            drawLandmarks(landmarks);

            // Recognize gesture
            const gestureKey = recognizeGesture(landmarks);
            const { gesture: stableGesture, stability } = pushToBuffer(gestureKey);

            if (gestureKey) {
                updateGestureDisplay(gestureKey);
                setDetectionStatus('Hand detected', true);
            }

            // Process stable gesture — only once per new gesture, with cooldown
            if (stableGesture && stableGesture !== state.lastStableGesture && !state.speechCooldown) {
                state.lastStableGesture = stableGesture;

                const g = GESTURES[stableGesture];
                if (g) {
                    addToTranslatedText(g.label);
                    addToSpeechLog(g.label);
                    speak(g.label);
                    scheduleAutoRefine();

                    // Cooldown to prevent rapid repeats
                    state.speechCooldown = true;
                    setTimeout(() => {
                        state.speechCooldown = false;
                    }, state.cooldownMs);
                }
            }
        } else {
            // No hand detected
            setDetectionStatus('No hand detected', false);
            pushToBuffer(null);

            // Reset stable gesture after buffer clears
            const nullCount = state.buffer.filter(g => g === null).length;
            if (nullCount >= state.requiredAgreement) {
                state.lastStableGesture = null;
                updateGestureDisplay(null);
            }
        }
    }

    function drawLandmarks(landmarks) {
        const w = DOM.canvas.width;
        const h = DOM.canvas.height;

        // Draw connections
        const connections = [
            [0,1],[1,2],[2,3],[3,4],       // Thumb
            [0,5],[5,6],[6,7],[7,8],       // Index
            [0,9],[9,10],[10,11],[11,12],  // Middle
            [0,13],[13,14],[14,15],[15,16],// Ring
            [0,17],[17,18],[18,19],[19,20],// Pinky
            [5,9],[9,13],[13,17],          // Palm
        ];

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 2;

        connections.forEach(([i, j]) => {
            const a = landmarks[i];
            const b = landmarks[j];
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
        });

        // Draw points
        landmarks.forEach((lm, idx) => {
            const x = lm.x * w;
            const y = lm.y * h;
            const isTip = [4, 8, 12, 16, 20].includes(idx);

            ctx.beginPath();
            ctx.arc(x, y, isTip ? 5 : 3, 0, 2 * Math.PI);
            ctx.fillStyle = isTip ? '#38bdf8' : '#a78bfa';
            ctx.fill();

            if (isTip) {
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });
    }

    // ─────────────────────────────────────────────
    // 10. Camera Control
    // ─────────────────────────────────────────────

    async function startCamera() {
        try {
            stopDemo(); // Stop demo if running

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });

            state.stream = stream;
            DOM.video.srcObject = stream;

            await DOM.video.play();

            // Set canvas dimensions to match video
            DOM.canvas.width = DOM.video.videoWidth || 640;
            DOM.canvas.height = DOM.video.videoHeight || 480;

            // Hide placeholder
            DOM.placeholder.classList.add('hidden');

            // Init MediaPipe
            if (!state.hands) {
                state.hands = initMediaPipeHands();
            }

            if (state.hands) {
                state.cameraActive = true;
                processFrames();
                setDetectionStatus('Initializing...', false);
            }

            // Update button states
            DOM.startBtn.disabled = true;
            DOM.stopBtn.disabled = false;
            DOM.demoBtn.disabled = true;

        } catch (err) {
            console.warn('Camera access denied or unavailable:', err);
            handleCameraError(err);
        }
    }

    function stopCamera() {
        state.cameraActive = false;

        if (state.stream) {
            state.stream.getTracks().forEach(track => track.stop());
            state.stream = null;
        }

        DOM.video.srcObject = null;

        if (state.animationId) {
            cancelAnimationFrame(state.animationId);
            state.animationId = null;
        }

        // Clear canvas
        ctx.clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);

        // Show placeholder
        DOM.placeholder.classList.remove('hidden');

        // Reset detection
        setDetectionStatus('Stopped', false);
        DOM.detectionIndicator.classList.remove('visible');
        DOM.viewport.classList.remove('detecting');

        // Update buttons
        DOM.startBtn.disabled = false;
        DOM.stopBtn.disabled = true;
        DOM.demoBtn.disabled = false;

        // Clear buffer
        state.buffer = [];
        state.lastStableGesture = null;
    }

    function processFrames() {
        if (!state.cameraActive || !state.hands) return;

        state.hands.send({ image: DOM.video }).then(() => {
            if (state.cameraActive) {
                state.animationId = requestAnimationFrame(processFrames);
            }
        }).catch(err => {
            console.warn('Frame processing error:', err);
            if (state.cameraActive) {
                state.animationId = requestAnimationFrame(processFrames);
            }
        });
    }

    function handleCameraError(err) {
        let message = 'Camera unavailable.';

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            message = 'Camera permission denied. Please allow camera access or try Demo Mode.';
        } else if (err.name === 'NotFoundError') {
            message = 'No camera found on this device. Try Demo Mode instead.';
        } else if (err.name === 'NotReadableError') {
            message = 'Camera is in use by another application.';
        }

        DOM.placeholder.innerHTML = `
            <div class="placeholder-icon">⚠️</div>
            <p style="color: var(--clr-warning);">${message}</p>
            <p class="placeholder-hint">Click <strong>Demo Mode</strong> to see a demonstration.</p>
        `;
        DOM.placeholder.classList.remove('hidden');
    }

    // ─────────────────────────────────────────────
    // 11. Demo Mode
    // ─────────────────────────────────────────────

    const DEMO_SEQUENCE = ['hello', 'yes', 'thankyou', 'iloveyou', 'peace', 'stop', 'no', 'help'];

    function startDemo() {
        stopCamera(); // Stop camera first
        state.demoActive = true;

        DOM.placeholder.innerHTML = `
            <div class="placeholder-icon">🎭</div>
            <p style="color: var(--clr-accent);">Demo Mode Active</p>
            <p class="placeholder-hint">Cycling through sample gestures automatically.</p>
        `;
        DOM.placeholder.classList.remove('hidden');

        setDetectionStatus('Demo Mode', true);
        DOM.detectionIndicator.classList.add('visible');

        // Update buttons
        DOM.startBtn.disabled = true;
        DOM.stopBtn.disabled = false;
        DOM.demoBtn.disabled = true;

        state.demoIndex = 0;
        demoTick();

        state.demoInterval = setInterval(demoTick, 2500);
    }

    function demoTick() {
        if (!state.demoActive) return;

        const key = DEMO_SEQUENCE[state.demoIndex % DEMO_SEQUENCE.length];
        const g = GESTURES[key];

        if (g) {
            updateGestureDisplay(key);
            updateConfidence(88 + Math.floor(Math.random() * 12)); // 88-99%
            addToTranslatedText(g.label);
            addToSpeechLog(g.label);
            speak(g.label);
        }

        state.demoIndex++;
    }

    function stopDemo() {
        state.demoActive = false;
        if (state.demoInterval) {
            clearInterval(state.demoInterval);
            state.demoInterval = null;
        }
    }

    // ─────────────────────────────────────────────
    // 12. Clear / Reset
    // ─────────────────────────────────────────────

    function clearAll() {
        state.words = [];
        state.buffer = [];
        state.lastStableGesture = null;

        DOM.translatedText.innerHTML = '<span class="text-placeholder">Detected gestures will appear here as text...</span>';
        DOM.speechLog.innerHTML = '<li class="log-placeholder">Spoken words will be logged here...</li>';

        updateGestureDisplay(null);
        updateConfidence(0);

        DOM.refinedOutput.classList.remove('visible');
        DOM.refinedOutput.textContent = '';
        DOM.refineBtn.disabled = true;

        // Cancel speech
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }

    // ─────────────────────────────────────────────
    // 13. DeepSeek AI Refinement (with auto-trigger)
    // ─────────────────────────────────────────────

    /**
     * Schedule an automatic DeepSeek call after a debounce delay.
     * Resets timer on each new gesture so we wait for a pause.
     */
    function scheduleAutoRefine() {
        if (state.autoRefineTimer) {
            clearTimeout(state.autoRefineTimer);
        }
        state.autoRefineTimer = setTimeout(() => {
            state.autoRefineTimer = null;
            autoRefineWithAI();
        }, state.autoRefineDelayMs);
    }

    /**
     * Auto-triggered refinement. Has throttle guard:
     * - At least autoRefineMinIntervalMs between auto-calls
     * - Skip if text hasn't changed since last call
     */
    function autoRefineWithAI() {
        if (state.words.length === 0) return;

        const text = state.words.join(' ');
        const now = Date.now();

        if (text === state.lastAutoRefineText) return; // nothing new
        if (now - state.lastAutoRefineTime < state.autoRefineMinIntervalMs) return; // throttled

        state.lastAutoRefineTime = now;
        state.lastAutoRefineText = text;
        refineWithAI();
    }

    /**
     * Core refine function — called manually (button) or automatically.
     * Sends recognized text to PHP backend proxy.
     * Expects response: { success, result, raw, error }
     */
    async function refineWithAI() {
        if (state.words.length === 0) return;

        const text = state.words.join(' ');
        DOM.refineBtn.disabled = true;
        DOM.refineBtn.textContent = '⏳ Refining...';

        try {
            const response = await fetch('api/deepseek.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text }),
            });

            const data = await response.json();

            if (data.success && data.result) {
                DOM.refinedOutput.innerHTML = `
                    <strong>AI Refined:</strong> ${escapeHTML(data.result)}
                    ${data.raw && data.raw !== data.result ? `<br><small style="color:var(--clr-text-dim)">Original: ${escapeHTML(data.raw)}</small>` : ''}
                `;
                DOM.refinedOutput.classList.add('visible');
            } else if (data.error) {
                // Show fallback: raw text + error message
                DOM.refinedOutput.innerHTML = `
                    <span style="color:var(--clr-warning);">⚠️ ${escapeHTML(data.error)}</span>
                    <br><small style="color:var(--clr-text-dim)">Recognized text: "${escapeHTML(data.raw || text)}"</small>
                `;
                DOM.refinedOutput.classList.add('visible');
            }
        } catch (err) {
            // Network error / PHP not available — show fallback
            DOM.refinedOutput.innerHTML = `<span style="color:var(--clr-text-dim);">AI refinement unavailable. Recognized text: "${escapeHTML(text)}"</span>`;
            DOM.refinedOutput.classList.add('visible');
        } finally {
            DOM.refineBtn.disabled = false;
            DOM.refineBtn.innerHTML = '<span class="btn-icon">✨</span> Refine with AI';
        }
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ─────────────────────────────────────────────
    // 14. Navigation & Scroll Handling
    // ─────────────────────────────────────────────

    function initNavigation() {
        // Mobile toggle
        DOM.navToggle.addEventListener('click', () => {
            DOM.navLinks.classList.toggle('open');
        });

        // Close mobile menu on link click
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                DOM.navLinks.classList.remove('open');
            });
        });

        // Scroll-based navbar style
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            DOM.navbar.classList.toggle('scrolled', scrollY > 50);
            lastScroll = scrollY;

            // Update active nav link
            updateActiveNavLink();
        }, { passive: true });
    }

    function updateActiveNavLink() {
        const sections = ['hero', 'translator', 'features', 'gestures', 'about'];
        const scrollPos = window.scrollY + 200;

        sections.forEach(id => {
            const section = document.getElementById(id);
            if (!section) return;

            const link = document.querySelector(`.nav-link[href="#${id}"]`);
            if (!link) return;

            if (section.offsetTop <= scrollPos && section.offsetTop + section.offsetHeight > scrollPos) {
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    }

    // ─────────────────────────────────────────────
    // 15. Event Listeners
    // ─────────────────────────────────────────────

    function bindEvents() {
        DOM.startBtn.addEventListener('click', startCamera);
        DOM.stopBtn.addEventListener('click', () => {
            stopCamera();
            stopDemo();
        });
        DOM.demoBtn.addEventListener('click', startDemo);
        DOM.clearBtn.addEventListener('click', clearAll);
        DOM.refineBtn.addEventListener('click', refineWithAI);
        DOM.speakAllBtn.addEventListener('click', () => {
            if (state.words.length > 0) {
                speak(state.words.join(', '));
            }
        });
    }

    // ─────────────────────────────────────────────
    // 16. Intersection Observer for Animations
    // ─────────────────────────────────────────────

    function initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px',
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        // Animate cards on scroll
        const animatedElements = document.querySelectorAll(
            '.feature-card, .gesture-info-card, .about-card, .presentation-item'
        );

        animatedElements.forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = `opacity 0.6s ${index * 0.08}s var(--ease-out), transform 0.6s ${index * 0.08}s var(--ease-out)`;
            observer.observe(el);
        });
    }

    // ─────────────────────────────────────────────
    // 17. Browser Compatibility Check
    // ─────────────────────────────────────────────

    function checkBrowserSupport() {
        const issues = [];

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            issues.push('Camera API (getUserMedia) is not supported.');
        }

        if (!('speechSynthesis' in window)) {
            issues.push('Text-to-Speech (SpeechSynthesis) is not supported.');
        }

        if (typeof Hands === 'undefined') {
            issues.push('MediaPipe Hands library failed to load. Check your internet connection.');
        }

        if (issues.length > 0) {
            console.warn('Browser compatibility issues:', issues);
            // Show warning but don't block — demo mode still works
            DOM.placeholder.innerHTML = `
                <div class="placeholder-icon">⚠️</div>
                <p style="color: var(--clr-warning);">Some features may not work:</p>
                <ul style="text-align:left; color:var(--clr-text-dim); font-size:0.875rem; padding-left:1rem;">
                    ${issues.map(i => `<li>${i}</li>`).join('')}
                </ul>
                <p class="placeholder-hint">Try using Chrome, Edge, or Safari for best results.</p>
            `;
        }
    }

    // ─────────────────────────────────────────────
    // 18. Initialize Application
    // ─────────────────────────────────────────────

    function init() {
        initNavigation();
        bindEvents();
        checkBrowserSupport();
        initScrollAnimations();

        // Log startup
        console.log('%c🤟 SignBridga AI Loaded', 'color: #38bdf8; font-size: 16px; font-weight: bold;');
        console.log('Ready for sign language detection. Click "Start Camera" to begin.');
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
