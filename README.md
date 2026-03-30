# 🤟 SignBridga AI — Real-Time Sign Language Translator

> **AI-powered sign language detection and translation** — entirely in the browser, using your camera, with instant text and speech output.

---

## 🎯 Project Overview

SignBridga AI is a web application that uses the user's camera to detect sign language hand gestures in real time, translating them into readable text and spoken voice. The entire recognition pipeline runs **in the browser** using [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) — no servers process your video, and no data leaves your device.

### What Makes This Project Unique

- **100% Client-Side AI** — Hand tracking and gesture recognition run locally in the browser using Google's MediaPipe Hands. No server-side ML infrastructure needed.
- **Zero Cost** — Deployable on free hosting (InfinityFree), no paid APIs required for core functionality.
- **Privacy by Design** — Camera feed is never uploaded or stored. All processing happens on-device.
- **Instant Voice Output** — Uses the browser's built-in SpeechSynthesis API to speak detected gestures aloud.
- **Demo Mode** — Works even without a camera for presentations and demonstrations.

---

## 📁 File Structure

```
SignBridga-AI-Project/
├── index.html          # Single-page application layout
├── styles.css          # Responsive design system
├── app.js              # Camera, MediaPipe, gesture recognition, TTS
├── api/
│   ├── config.php      # API key configuration (DeepSeek, optional)
│   └── deepseek.php    # Secure API proxy endpoint (optional)
├── Doc/                # Project documentation
└── README.md           # This file
```

---

## 🚀 Deployment on InfinityFree

### Step 1: Create an InfinityFree Account
1. Go to [InfinityFree.com](https://www.infinityfree.com/) and create a free account.
2. Create a new hosting account (you'll get a subdomain like `yoursite.infinityfreeapp.com`).

### Step 2: Upload Files
1. Open the **File Manager** from your InfinityFree control panel.
2. Navigate to the `htdocs/` directory.
3. Upload **all project files** maintaining the folder structure:
   - `index.html` → `htdocs/index.html`
   - `styles.css` → `htdocs/styles.css`
   - `app.js` → `htdocs/app.js`
   - `api/config.php` → `htdocs/api/config.php`
   - `api/deepseek.php` → `htdocs/api/deepseek.php`

### Step 3: Configure API Key (Optional)
1. Edit `api/config.php` on the server.
2. Replace `'YOUR_API_KEY_HERE'` with your DeepSeek API key.
3. The app works fully **without** the API key — this is only for the optional AI text refinement feature.

### Step 4: Enable HTTPS
1. InfinityFree provides free SSL. Enable it in the control panel.
2. **HTTPS is required** for camera access (`getUserMedia`) on most browsers.

### Step 5: Test
1. Visit `https://yoursite.infinityfreeapp.com`
2. Click **Start Camera** and allow camera access.
3. Hold a supported hand gesture in front of the camera.
4. The gesture label, translated text, and voice output should appear within 1-2 seconds.

---

## 🧪 Testing Instructions

### Local Testing
```bash
# 1. Navigate to the project directory
cd SignBridga-AI-Project

# 2. Start a local PHP server
php -S localhost:8000

# 3. Open Chrome and navigate to:
#    http://localhost:8000
```

### What to Test
| Test Case | Expected Result |
|-----------|----------------|
| Click "Start Camera" | Live video feed appears with hand landmark overlay |
| Hold open hand (all 5 fingers) | "Hello" detected, spoken aloud, added to text |
| Hold thumbs up | "Yes" detected |
| Hold thumbs down | "No" detected |
| Hold peace sign (V) | "Peace" detected |
| Hold ILY sign (thumb+index+pinky) | "I Love You" detected |
| Hold flat hand (4 fingers, no thumb) | "Thank You" detected |
| Click "Demo Mode" | Automatic gesture cycling without camera |
| Click "Clear" | All text, logs, and display reset |
| Deny camera permission | Error message with demo mode suggestion |
| Click "Refine with AI" | Sends text to PHP proxy (if configured) |

### PHP Syntax Verification
```bash
php -l api/config.php
php -l api/deepseek.php
```

---

## ✋ Supported Gestures

| # | Gesture | Detection Rule | Emoji |
|---|---------|---------------|-------|
| 1 | **Hello** | All 5 fingers extended, spread apart | 👋 |
| 2 | **Yes** | Only thumb extended, pointing up | 👍 |
| 3 | **No** | Only thumb extended, pointing down | 👎 |
| 4 | **Help** | Fist with thumb raised | 🆘 |
| 5 | **Thank You** | Four fingers extended (no thumb), together | 🙏 |
| 6 | **I Love You** | Thumb + index + pinky extended, middle + ring curled | 🤟 |
| 7 | **Stop** | All 5 fingers extended, held together (palm forward) | ✋ |
| 8 | **Peace** | Index + middle extended, others curled | ✌️ |

### Detection Mechanism
- **MediaPipe Hands** detects 21 hand landmarks in real time.
- Each gesture is recognized by checking which fingers are **extended vs curled** using landmark positions (tip vs PIP joint y-coordinates).
- A **stabilization buffer** (8 frames, 5/8 agreement required) prevents flickering and false positives.
- Speech fires only when a **new stable gesture** is detected, with a 1.8-second cooldown.

---

## 🛠 Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│                     BROWSER                          │
│                                                     │
│  getUserMedia ──► MediaPipe Hands (WASM) ──► 21     │
│   Camera            in-browser AI          landmarks│
│                                                     │
│  Landmarks ──► Gesture Recognizer ──► Buffer ──►    │
│               (deterministic rules)   (stability)   │
│                                                     │
│  Stable Gesture ──► Text Display                    │
│                 ──► SpeechSynthesis (TTS)            │
│                 ──► Speech Log                       │
│                                                     │
│  [Optional] ──► fetch('/api/deepseek.php') ──►      │
│                 AI text refinement                   │
└─────────────────────────────────────────────────────┘
                        │ (optional)
                        ▼
┌─────────────────────────────────────────────────────┐
│              PHP SERVER (InfinityFree)                │
│                                                     │
│  api/deepseek.php  ──►  DeepSeek API                │
│  (secure proxy)        (grammar refinement)         │
│                                                     │
│  api/config.php                                     │
│  (API key storage)                                  │
└─────────────────────────────────────────────────────┘
```

### Technologies Used
- **HTML5** — Semantic page structure
- **CSS3** — Custom properties, grid, flexbox, responsive design, glassmorphism
- **JavaScript (ES6+)** — Modules, async/await, Web APIs
- **MediaPipe Hands** — Google's hand tracking ML model (runs in browser via WASM)
- **Web Speech API** — Browser-native text-to-speech
- **PHP** — Secure server-side API proxy

---

## 🎓 Academic Presentation Guide

### Why This Project Matters

1. **Real-World Problem** — 70+ million deaf people globally face daily communication barriers.
2. **Innovative Solution** — Browser-based AI makes sign language translation free and accessible to anyone with a camera.
3. **Technical Depth** — Combines computer vision, machine learning inference, real-time processing, and speech synthesis.
4. **Privacy & Ethics** — All processing is local; no user data is collected or transmitted.
5. **Cost Efficiency** — Zero infrastructure cost using free hosting and browser-native APIs.

### Demo Script for Instructors

1. **Open** the website on a laptop with a camera.
2. **Scroll** through the landing page — highlight the hero section, features, and gesture glossary.
3. **Click "Start Camera"** — show the live video feed with hand landmark overlay.
4. **Demonstrate gestures** one by one:
   - Open hand → "Hello" appears and is spoken
   - Thumbs up → "Yes"
   - Peace sign → "Peace"
   - ILY sign → "I Love You"
5. **Show the translated text** accumulating in the text card.
6. **Click "Speak All"** to hear the full sentence.
7. **Click "Refine with AI"** (if configured) to show DeepSeek integration.
8. **Show Demo Mode** — click Demo Mode to demonstrate the UI cycling through gestures automatically (useful if the camera is not available in the presentation room).
9. **Show responsiveness** — resize the browser window to show mobile layout.
10. **Explain the architecture** — point to the About section's "Project at a Glance" block.

### Key Talking Points

- **Originality**: Browser-based sign language translation without server-side ML infrastructure.
- **Technical Skills**: MediaPipe integration, real-time frame processing, stabilization algorithms, SpeechSynthesis API.
- **Management Skills**: Structured development timeline, modular codebase, clear documentation.
- **Community Benefit**: Free, accessible tool for hospitals, schools, and public services.
- **Scalability**: Architecture supports adding more gestures without redesign.

---

## 📄 License

This project was built for academic purposes. All code is original and free to use for educational projects.

---

## 🏗 Built By

**SignBridga AI Team** — Breaking Communication Barriers with Artificial Intelligence.
