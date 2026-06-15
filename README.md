# ✦ AirDraw — AI-Powered Air Drawing App

> Draw in the air with just your finger. No stylus. No touch. Just your hand.

Built with **MediaPipe Hands** + **Canvas API** + **Vanilla JS**.

---

## 📁 Folder Structure

```
AirDraw/
├── index.html       # App shell & toolbar markup
├── style.css        # Glassmorphism dark UI, animations
├── script.js        # HandTracker, DrawEngine, HistoryManager, UIController
└── README.md        # This file
```

---

## ⚡ Setup Instructions

### Option A — Local (Recommended)

> ⚠️ Must be served via HTTP(S), not opened as a `file://` URL (browser blocks camera on file://).

**Using VS Code Live Server:**
1. Install the "Live Server" extension in VS Code
2. Right-click `index.html` → **Open with Live Server**
3. Browser opens at `http://127.0.0.1:5500`
4. Allow camera permission → point your index finger → draw!

**Using Python:**
```bash
cd AirDraw
python3 -m http.server 8080
# Open http://localhost:8080
```

**Using Node.js:**
```bash
npx serve AirDraw
# or
npx http-server AirDraw
```

---

## 🌍 GitHub Pages Deployment

```bash
# 1. Create a new repo on GitHub (e.g. "airdraw")

# 2. Init and push
git init
git add .
git commit -m "🚀 Initial release"
git remote add origin https://github.com/YOUR_USERNAME/airdraw.git
git push -u origin main

# 3. Enable GitHub Pages
# Go to repo Settings → Pages → Source: main branch / root
# Your app will be live at: https://YOUR_USERNAME.github.io/airdraw
```

> ✅ GitHub Pages serves over HTTPS, so webcam access works automatically.

---

## 🎮 How to Draw

| Gesture | Action |
|---|---|
| ☝️ Index finger extended, middle curled | **Draw** |
| ✊ Fist / open palm | **Pause drawing** |
| Mouse click + drag | **Fallback draw** (if no webcam) |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `P` | Switch to Pen |
| `E` | Switch to Eraser |
| `Delete` | Clear canvas |
| `F` | Toggle Fullscreen |

---

## 🚀 Performance Optimization Techniques Used

1. **Quadratic Bézier curves** instead of lineTo() — silky smooth strokes
2. **Position smoothing buffer** (4-frame average) — eliminates hand jitter
3. **`requestAnimationFrame` via MediaPipe Camera** — frame-perfect rendering
4. **Separate canvas layers** — webcam feed and drawing layer are independent; no blending overhead per frame
5. **Canvas state snapshots** (ImageData) for undo/redo — no re-rendering needed
6. **Composite operation switching** — eraser uses `destination-out`, zero overdraw
7. **ResizeObserver** instead of `window.resize` — efficient canvas resize detection
8. **Shadow blur only on pen** — skips expensive glow computation for eraser

---

## 🔮 Future Feature Suggestions

### Near-term
- [ ] **Shape mode** — detect circular/linear gestures and snap to shapes
- [ ] **Text overlay** — voice-to-text captions drawn onto canvas
- [ ] **Brush presets** — calligraphy, neon spray, dotted
- [ ] **Two-hand support** — one hand draws, other controls tools via gestures
- [ ] **Timer / countdown** — for live demo showcases

### Advanced
- [ ] **WebRTC multiplayer** — real-time collaborative air drawing
- [ ] **3D depth drawing** — use z-axis to control brush size
- [ ] **AI style transfer** — apply artistic styles to your drawing via Claude API
- [ ] **WebXR / AR mode** — overlay on real world via phone camera
- [ ] **Export as SVG** — vector output from canvas paths

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Hand detection | MediaPipe Hands (CDN) |
| Rendering | Canvas API (2D) |
| Camera | MediaPipe Camera Utils |
| UI | Vanilla JS + CSS3 Glassmorphism |
| Hosting | GitHub Pages / Any static host |

---

## 📱 Browser Support

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full |
| Edge 90+ | ✅ Full |
| Firefox 88+ | ✅ Full |
| Safari 15+ | ✅ Full |
| Mobile Chrome | ✅ Supported |
| Mobile Safari | ✅ Supported |

---

Made with ✦ by **@code.akshat.in** — Build with Claude 🤖
