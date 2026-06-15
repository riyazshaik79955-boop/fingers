/**
 * AirDraw — script.js
 * ─────────────────────────────────────────────────────
 * Air drawing using MediaPipe Hands + Canvas API.
 *
 * Architecture:
 *   HandTracker  → detects landmarks via MediaPipe
 *   DrawEngine   → renders strokes onto canvas
 *   HistoryManager → undo/redo stack
 *   UIController → wires DOM events to engine
 *   App          → boots everything
 * ─────────────────────────────────────────────────────
 */

'use strict';

/* ═══════════════════════════════
   1. CONSTANTS & CONFIG
   ═══════════════════════════════ */
const CONFIG = {
  // MediaPipe model settings
  maxNumHands: 1,
  modelComplexity: 1,      // 0=lite, 1=full
  minDetectionConfidence: 0.75,
  minTrackingConfidence:  0.65,

  // Drawing defaults
  defaultColor:  '#00f5ff',
  defaultSize:   6,
  defaultOpacity: 1.0,

  // Gesture: z-distance threshold for "drawing vs lifted" state
  // Lower = more sensitive (draws more easily)
  drawThreshold: 0.02,

  // Smoothing: how many frames to average finger position
  smoothingFrames: 4,

  // Max history stack depth
  maxHistory: 50,
};

/* ═══════════════════════════════
   2. HISTORY MANAGER  (Undo/Redo)
   ═══════════════════════════════ */
class HistoryManager {
  constructor(maxSize = CONFIG.maxHistory) {
    this.stack = [];   // array of ImageData snapshots
    this.pointer = -1; // current position
    this.maxSize = maxSize;
  }

  /** Save current canvas state */
  save(canvas) {
    const ctx = canvas.getContext('2d');
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Trim redo future if we branched
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(snap);

    // Enforce max size (drop oldest)
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.pointer++;
    }
  }

  /** Restore previous state (undo) */
  undo(canvas) {
    if (this.pointer <= 0) return false;
    this.pointer--;
    this._restore(canvas);
    return true;
  }

  /** Restore next state (redo) */
  redo(canvas) {
    if (this.pointer >= this.stack.length - 1) return false;
    this.pointer++;
    this._restore(canvas);
    return true;
  }

  _restore(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.putImageData(this.stack[this.pointer], 0, 0);
  }

  canUndo() { return this.pointer > 0; }
  canRedo() { return this.pointer < this.stack.length - 1; }

  /** Clear history and save blank slate */
  reset(canvas) {
    this.stack = [];
    this.pointer = -1;
    this.save(canvas);
  }
}

/* ═══════════════════════════════
   3. DRAW ENGINE
   ═══════════════════════════════ */
class DrawEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    // Current brush state
    this.color   = CONFIG.defaultColor;
    this.size    = CONFIG.defaultSize;
    this.opacity = CONFIG.defaultOpacity;
    this.tool    = 'pen'; // 'pen' | 'eraser'

    // Stroke state
    this.isDrawing   = false;
    this.lastX       = 0;
    this.lastY       = 0;

    // Smoothing buffer
    this.posBuffer   = [];

    this._setupCanvas();
  }

  _setupCanvas() {
    // Make canvas fill parent element
    const resize = () => {
      const parent = this.canvas.parentElement;
      const w = parent.clientWidth;
      const h = parent.clientHeight;

      // Preserve drawing content on resize
      const snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.width  = w;
      this.canvas.height = h;
      this.ctx.putImageData(snapshot, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);
  }

  /** Start a new stroke at (x, y) */
  startStroke(x, y) {
    this.isDrawing = true;
    this.lastX     = x;
    this.lastY     = y;
    this.posBuffer = [{ x, y }];
  }

  /**
   * Continue stroke to (x, y).
   * Uses quadratic bezier for smooth curves.
   */
  continueStroke(x, y) {
    if (!this.isDrawing) return;

    // Add to smoothing buffer
    this.posBuffer.push({ x, y });
    if (this.posBuffer.length > CONFIG.smoothingFrames) {
      this.posBuffer.shift();
    }

    // Average positions for smoothing
    const sx = this.posBuffer.reduce((s, p) => s + p.x, 0) / this.posBuffer.length;
    const sy = this.posBuffer.reduce((s, p) => s + p.y, 0) / this.posBuffer.length;

    const ctx = this.ctx;
    ctx.save();

    if (this.tool === 'eraser') {
      // Eraser: composite to erase pixels
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth   = this.size * 4; // Eraser is larger
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this._colorWithOpacity();
      ctx.lineWidth   = this.size;
      ctx.shadowColor = this.color;
      ctx.shadowBlur  = this.size * 1.5; // Glow effect
    }

    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);

    // Quadratic bezier to midpoint for smooth curves
    const mx = (this.lastX + sx) / 2;
    const my = (this.lastY + sy) / 2;
    ctx.quadraticCurveTo(this.lastX, this.lastY, mx, my);

    ctx.stroke();
    ctx.restore();

    this.lastX = sx;
    this.lastY = sy;
  }

  /** End current stroke */
  endStroke() {
    this.isDrawing   = false;
    this.posBuffer   = [];
  }

  /** Clear entire canvas */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.endStroke();
  }

  /** Convert hex+opacity to rgba string */
  _colorWithOpacity() {
    const r = parseInt(this.color.slice(1,3), 16);
    const g = parseInt(this.color.slice(3,5), 16);
    const b = parseInt(this.color.slice(5,7), 16);
    return `rgba(${r},${g},${b},${this.opacity})`;
  }

  /** Map normalized MediaPipe coords → canvas pixels */
  toCanvasCoords(normX, normY) {
    // MediaPipe returns [0..1]; canvas is mirrored via CSS scaleX(-1)
    // so we flip X here too for natural drawing
    return {
      x: (1 - normX) * this.canvas.width,
      y: normY       * this.canvas.height,
    };
  }
}

/* ═══════════════════════════════
   4. HAND TRACKER
   ═══════════════════════════════ */
class HandTracker {
  constructor({ onHandDetected, onHandLost, onFingerMove, onDrawState }) {
    this.callbacks = { onHandDetected, onHandLost, onFingerMove, onDrawState };
    this.drawThreshold = CONFIG.drawThreshold;
    this._handPresent  = false;
    this._wasDrawing   = false;
  }

  async init(videoEl, outputCanvas) {
    this.videoEl      = videoEl;
    this.outputCanvas = outputCanvas;
    this.outCtx       = outputCanvas.getContext('2d');

    // ── MediaPipe Hands setup ──
    this.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands:              CONFIG.maxNumHands,
      modelComplexity:          CONFIG.modelComplexity,
      minDetectionConfidence:   CONFIG.minDetectionConfidence,
      minTrackingConfidence:    CONFIG.minTrackingConfidence,
    });

    this.hands.onResults((results) => this._onResults(results));

    // ── Camera setup ──
    this.camera = new Camera(videoEl, {
      onFrame: async () => {
        await this.hands.send({ image: videoEl });
      },
      width:  1280,
      height: 720,
      facingMode: 'user',
    });

    await this.camera.start();
  }

  /**
   * Called every frame with MediaPipe results.
   * Extracts finger landmarks and determines draw state.
   */
  _onResults(results) {
    const { width, height } = this.outputCanvas;

    // Resize output canvas to match video
    if (this.outputCanvas.width !== results.image.width) {
      this.outputCanvas.width  = results.image.width;
      this.outputCanvas.height = results.image.height;
    }

    // Draw mirrored webcam frame
    const ctx = this.outCtx;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(results.image, 0, 0, width, height);
    ctx.restore();

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      // No hand detected
      if (this._handPresent) {
        this._handPresent = false;
        this.callbacks.onHandLost?.();
      }
      return;
    }

    if (!this._handPresent) {
      this._handPresent = true;
      this.callbacks.onHandDetected?.();
    }

    const landmarks = results.multiHandLandmarks[0];

    // Landmark indices (MediaPipe hand model):
    // 8  = index fingertip
    // 7  = index DIP (joint below tip)
    // 4  = thumb tip
    // 12 = middle fingertip
    const indexTip    = landmarks[8];
    const indexDIP    = landmarks[7];
    const middleTip   = landmarks[12];
    const thumbTip    = landmarks[4];
    const wrist       = landmarks[0];

    // ── Gesture: is finger "down" (drawing) or "up" (lifted)? ──
    // We use the z-depth of index tip vs its DIP joint.
    // When you point finger straight, tip.z < dip.z (closer to camera).
    // We also check middle finger is curled (not open palm).
    const indexExtended = indexTip.y < indexDIP.y; // tip above DIP = extended
    const middleCurled  = middleTip.y > landmarks[10].y; // middle curled = not open

    // Draw if index is extended AND middle is curled (pointing gesture)
    const isDrawing = indexExtended && middleCurled;

    // Report finger position
    this.callbacks.onFingerMove?.({
      x:   indexTip.x,
      y:   indexTip.y,
      z:   indexTip.z,
    });

    // Report draw state changes
    if (isDrawing !== this._wasDrawing) {
      this._wasDrawing = isDrawing;
      this.callbacks.onDrawState?.(isDrawing);
    }

    // Optional: draw skeleton for visual feedback
    if (window.drawConnectors) {
      ctx.save();
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
        color: 'rgba(0,245,255,0.25)', lineWidth: 1.5,
      });
      drawLandmarks(ctx, [landmarks[8]], {
        color: '#00f5ff', lineWidth: 1, radius: 5,
        fillColor: 'rgba(0,245,255,0.5)',
      });
      ctx.restore();
    }
  }

  /** Update draw threshold sensitivity */
  setThreshold(val) { this.drawThreshold = val; }
}

/* ═══════════════════════════════
   5. UI CONTROLLER
   ═══════════════════════════════ */
class UIController {
  constructor(engine, history) {
    this.engine  = engine;
    this.history = history;
    this._bind();
  }

  _bind() {
    const e = this.engine;

    /* ── Tool buttons ── */
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        e.tool = btn.dataset.tool;
        showToast(e.tool === 'eraser' ? '⬜ Eraser on' : '✏️ Pen on');
      });
    });

    /* ── Color swatches ── */
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        e.color = swatch.dataset.color;
        // Also sync custom color picker
        document.getElementById('customColor').value = swatch.dataset.color;
      });
    });

    /* ── Custom color picker ── */
    document.getElementById('customColor').addEventListener('input', (ev) => {
      e.color = ev.target.value;
      // Deselect preset swatches
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    });

    /* ── Brush size slider ── */
    const sizeSlider  = document.getElementById('brushSize');
    const sizeLabel   = document.getElementById('sizeVal');
    sizeSlider.addEventListener('input', () => {
      e.size = parseInt(sizeSlider.value);
      sizeLabel.textContent = sizeSlider.value;
    });

    /* ── Opacity slider ── */
    const opSlider = document.getElementById('brushOpacity');
    const opLabel  = document.getElementById('opacityVal');
    opSlider.addEventListener('input', () => {
      e.opacity = parseInt(opSlider.value) / 100;
      opLabel.textContent = opSlider.value;
    });

    /* ── Clear ── */
    document.getElementById('clearBtn').addEventListener('click', () => {
      e.clear();
      this.history.reset(e.canvas);
      this._updateUndoRedo();
      showToast('🗑️ Canvas cleared');
    });

    /* ── Save ── */
    document.getElementById('saveBtn').addEventListener('click', () => {
      this._saveAsPNG();
    });

    /* ── Undo ── */
    const undoBtn = document.getElementById('undoBtn');
    undoBtn.addEventListener('click', () => {
      if (this.history.undo(e.canvas)) {
        this._updateUndoRedo();
        showToast('↩️ Undo');
      }
    });

    /* ── Redo ── */
    const redoBtn = document.getElementById('redoBtn');
    redoBtn.addEventListener('click', () => {
      if (this.history.redo(e.canvas)) {
        this._updateUndoRedo();
        showToast('↪️ Redo');
      }
    });

    /* ── Fullscreen ── */
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
      this._toggleFullscreen();
    });

    /* ── Sensitivity ── */
    document.querySelectorAll('.sens-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sens-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window._tracker?.setThreshold(parseFloat(btn.dataset.sens));
        showToast(`🎯 Sensitivity: ${btn.textContent}`);
      });
    });

    /* ── Keyboard shortcuts ── */
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') { undoBtn.click(); }
      if (e.ctrlKey && e.key === 'y') { redoBtn.click(); }
      if (e.key === 'Delete')          { document.getElementById('clearBtn').click(); }
      if (e.key === 'f' || e.key === 'F') { this._toggleFullscreen(); }
      if (e.key === 'e' || e.key === 'E') {
        document.getElementById('eraserBtn').click();
      }
      if (e.key === 'p' || e.key === 'P') {
        document.getElementById('penBtn').click();
      }
    });

    /* ── Mouse/Touch fallback drawing (for testing without webcam) ── */
    this._bindMouseFallback();
  }

  /** Allow mouse/touch drawing as fallback */
  _bindMouseFallback() {
    const canvas = this.engine.canvas;

    const getPos = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const src  = ev.touches ? ev.touches[0] : ev;
      // Mirror X since canvas is CSS-flipped
      return {
        x: canvas.width - (src.clientX - rect.left) * (canvas.width / rect.width),
        y: (src.clientY - rect.top) * (canvas.height / rect.height),
      };
    };

    const down = (ev) => {
      ev.preventDefault();
      const pos = getPos(ev);
      this.engine.startStroke(pos.x, pos.y);
    };
    const move = (ev) => {
      ev.preventDefault();
      if (!this.engine.isDrawing) return;
      const pos = getPos(ev);
      this.engine.continueStroke(pos.x, pos.y);
    };
    const up = () => {
      if (this.engine.isDrawing) {
        this.engine.endStroke();
        this.history.save(this.engine.canvas);
        this._updateUndoRedo();
      }
    };

    canvas.addEventListener('mousedown',  down);
    canvas.addEventListener('mousemove',  move);
    canvas.addEventListener('mouseup',    up);
    canvas.addEventListener('mouseleave', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove',  move, { passive: false });
    canvas.addEventListener('touchend',   up);
  }

  /** Save canvas + webcam composite as PNG */
  _saveAsPNG() {
    const drawCanvas   = this.engine.canvas;
    const outputCanvas = document.getElementById('outputCanvas');

    // Create a temp canvas to composite both layers
    const temp = document.createElement('canvas');
    temp.width  = drawCanvas.width;
    temp.height = drawCanvas.height;
    const ctx = temp.getContext('2d');

    // Flip to match visible orientation (undo CSS mirror)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-temp.width, 0);
    ctx.drawImage(outputCanvas, 0, 0, temp.width, temp.height);
    ctx.restore();

    // Draw strokes (already in correct orientation internally)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-temp.width, 0);
    ctx.drawImage(drawCanvas, 0, 0, temp.width, temp.height);
    ctx.restore();

    const link = document.createElement('a');
    link.download = `airdraw_${Date.now()}.png`;
    link.href = temp.toDataURL('image/png');
    link.click();

    showToast('💾 Drawing saved!');
  }

  _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  _updateUndoRedo() {
    document.getElementById('undoBtn').disabled = !this.history.canUndo();
    document.getElementById('redoBtn').disabled = !this.history.canRedo();
  }
}

/* ═══════════════════════════════
   6. STATUS & TOAST HELPERS
   ═══════════════════════════════ */
function setStatus(state, label) {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusLabel');
  dot.className  = `status-dot ${state}`;
  text.textContent = label;
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ═══════════════════════════════
   7. APP BOOTSTRAP
   ═══════════════════════════════ */
async function App() {
  // ── DOM refs ──
  const videoEl      = document.getElementById('webcam');
  const outputCanvas = document.getElementById('outputCanvas');
  const drawCanvas   = document.getElementById('drawCanvas');
  const fingerCursor = document.getElementById('fingerCursor');
  const gestureHint  = document.getElementById('gestureHint');

  // ── Initialise core modules ──
  const history = new HistoryManager();
  const engine  = new DrawEngine(drawCanvas);
  const ui      = new UIController(engine, history);

  // Save blank state to history
  history.reset(drawCanvas);

  // ── Finger cursor tracking ──
  let hintHidden   = false;
  let strokeSaved  = false; // prevent saving mid-stroke repeatedly

  const tracker = new HandTracker({
    onHandDetected: () => {
      setStatus('active', 'Hand detected');
      if (!hintHidden) {
        gestureHint.classList.add('hidden');
        hintHidden = true;
      }
    },
    onHandLost: () => {
      setStatus('active', 'Ready — show your hand');
      fingerCursor.classList.remove('visible');
      engine.endStroke();
    },

    onFingerMove: ({ x, y }) => {
      // Move cursor dot (mirrored to match CSS flip)
      const rect = drawCanvas.getBoundingClientRect();
      fingerCursor.style.left = `${(1 - x) * rect.width}px`;
      fingerCursor.style.top  = `${y * rect.height}px`;
      fingerCursor.classList.add('visible');

      // Continue stroke if drawing
      if (engine.isDrawing) {
        const pos = engine.toCanvasCoords(x, y);
        engine.continueStroke(pos.x, pos.y);
      }
    },

    onDrawState: (isDrawing) => {
      if (isDrawing) {
        // Start stroke at current finger position
        setStatus('drawing', 'Drawing…');
        const rect = drawCanvas.getBoundingClientRect();
        const cx   = parseFloat(fingerCursor.style.left) / rect.width;
        const cy   = parseFloat(fingerCursor.style.top)  / rect.height;
        const pos  = engine.toCanvasCoords(cx, cy);
        engine.startStroke(pos.x, pos.y);
        strokeSaved = false;
      } else {
        // End stroke and save to history
        setStatus('active', 'Hand detected');
        engine.endStroke();
        if (!strokeSaved) {
          history.save(drawCanvas);
          document.getElementById('undoBtn').disabled = !history.canUndo();
          document.getElementById('redoBtn').disabled = !history.canRedo();
          strokeSaved = true;
        }
      }
    },
  });

  // Expose tracker for sensitivity control
  window._tracker = tracker;

  // ── Start camera ──
  setStatus('', 'Starting camera…');
  try {
    await tracker.init(videoEl, outputCanvas);
    setStatus('active', 'Ready — show your hand');
    showToast('☝️ Point your index finger to draw!');
  } catch (err) {
    console.error('Camera init error:', err);
    setStatus('error', 'Camera error — check permissions');
    showToast('❌ Camera access denied. Use mouse to draw.');

    // Fallback: hide gesture hint, allow mouse drawing only
    gestureHint.classList.add('hidden');
  }

  // ── Output canvas resize sync ──
  const resizeObserver = new ResizeObserver(() => {
    const wrapper = document.getElementById('canvasWrapper');
    outputCanvas.style.width  = '100%';
    outputCanvas.style.height = '100%';
  });
  resizeObserver.observe(document.getElementById('canvasWrapper'));
}

// ── Kick off ──
document.addEventListener('DOMContentLoaded', App);
