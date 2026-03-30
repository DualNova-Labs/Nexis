// Hand Tracking Module using MediaPipe Hands
// This module enables drawing on the whiteboard using hand gestures

let hands = null;
let camera = null;
let isHandTrackingActive = false;
let isDrawingWithHand = false;
let lastHandPosition = { x: 0, y: 0 };

// DOM Elements - initialized after DOM is ready
let videoElement = null;
let outputCanvas = null;
let outputCtx = null;
let cameraPreview = null;
let handTracker = null;
let handTrackingBtn = null;
let mainCanvas = null;
let mainCtx = null;

// Configuration
const PINCH_THRESHOLD = 0.05; // Distance between thumb and index to trigger pinch
const SMOOTHING_FACTOR = 0.3; // For smoothing hand movement

// Initialize DOM elements
function initDOMElements() {
    videoElement = document.getElementById('inputVideo');
    outputCanvas = document.getElementById('outputCanvas');
    outputCtx = outputCanvas ? outputCanvas.getContext('2d') : null;
    cameraPreview = document.getElementById('cameraPreview');
    handTracker = document.getElementById('handTracker');
    handTrackingBtn = document.getElementById('handTrackingBtn');
    mainCanvas = document.getElementById('canvas');
    mainCtx = mainCanvas ? mainCanvas.getContext('2d') : null;
}

// Initialize hand tracking
function initHandTracking() {
    if (hands) return;

    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    hands.onResults(onHandResults);
}

// Start hand tracking
async function startHandTracking() {
    if (isHandTrackingActive) return;

    // Ensure DOM elements are initialized
    if (!videoElement) initDOMElements();

    // Re-grab mainCtx in case canvas was resized/repainted
    if (mainCanvas) mainCtx = mainCanvas.getContext('2d');

    // Validate required elements exist
    if (!videoElement || !outputCanvas || !cameraPreview || !mainCanvas) {
        console.error('Hand tracking: Required DOM elements not found');
        if (window.toast) window.toast.error('Hand tracking failed. Please refresh the page.');
        else alert('Hand tracking initialization failed. Please refresh the page.');
        return;
    }

    try {
        console.log('Starting hand tracking...');

        // Show loading state on the button
        if (handTrackingBtn) {
            handTrackingBtn.style.opacity = '0.6';
            handTrackingBtn.title = 'Starting camera…';
        }

        // Initialize MediaPipe Hands (idempotent)
        initHandTracking();

        // FIX: Mark active BEFORE camera.start() so onFrame doesn't skip the first frames
        isHandTrackingActive = true;

        // Set canvas output size before camera starts
        outputCanvas.width = 320;
        outputCanvas.height = 240;

        // Set up camera using MediaPipe Camera utility
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (hands && isHandTrackingActive) {
                    await hands.send({ image: videoElement });
                }
            },
            width: 320,
            height: 240
        });

        await camera.start();
        console.log('Camera started successfully');

        // Show UI elements
        cameraPreview.classList.add('active');
        handTrackingBtn.classList.add('active');
        if (handTrackingBtn) {
            handTrackingBtn.style.opacity = '';
            handTrackingBtn.title = 'Hand Tracking (Active) — pinch to draw';
        }
        if (window.toast) window.toast.success('Hand tracking active — pinch fingers to draw!');

    } catch (error) {
        console.error('Error starting hand tracking:', error);
        // FIX: Use toast instead of alert
        if (window.toast) window.toast.error('Camera access denied. Please grant camera permission and try again.');
        else alert('Unable to access camera. Please ensure camera permissions are granted and try again.');
        isHandTrackingActive = false; // reset since startup failed
        if (handTrackingBtn) {
            handTrackingBtn.style.opacity = '';
            handTrackingBtn.title = 'Hand Tracking';
        }
        stopHandTracking();
    }
}

// Stop hand tracking
function stopHandTracking() {
    console.log('Stopping hand tracking...');
    
    isHandTrackingActive = false;
    isDrawingWithHand = false;

    // Stop camera
    if (camera) {
        try { camera.stop(); } catch (e) { console.warn('Error stopping camera:', e); }
        camera = null;
    }

    // Hide UI elements
    if (cameraPreview) cameraPreview.classList.remove('active');
    if (handTracker) {
        handTracker.classList.remove('active');
        handTracker.classList.remove('drawing');
    }
    if (handTrackingBtn) {
        handTrackingBtn.classList.remove('active');
        handTrackingBtn.style.opacity = '';
        handTrackingBtn.title = 'Hand Tracking';
    }

    // Clear output canvas
    if (outputCtx && outputCanvas) {
        outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    }
}

// Process hand detection results
function onHandResults(results) {
    if (!outputCtx || !outputCanvas) return;

    // Clear output canvas
    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        // No hand detected - keep tracker visible but stop drawing
        if (isDrawingWithHand) {
            isDrawingWithHand = false;
            if (handTracker) handTracker.classList.remove('drawing');
        }
        return;
    }

    // Get the first detected hand
    const landmarks = results.multiHandLandmarks[0];

    // Draw hand landmarks on preview canvas
    drawConnectors(outputCtx, landmarks, HAND_CONNECTIONS, {
        color: '#00FF00',
        lineWidth: 2
    });
    drawLandmarks(outputCtx, landmarks, {
        color: '#FF0000',
        lineWidth: 1,
        radius: 3
    });

    // Get index finger tip (landmark 8) and thumb tip (landmark 4)
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];

    // Calculate distance between thumb and index finger (pinch detection)
    const distance = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) + 
        Math.pow(indexTip.y - thumbTip.y, 2)
    );

    // Map hand position to canvas coordinates
    const canvasRect = mainCanvas.getBoundingClientRect();
    
    // Mirror the x coordinate (since camera is mirrored)
    const handX = (1 - indexTip.x) * canvasRect.width;
    const handY = indexTip.y * canvasRect.height;

    // Smooth the hand position
    const smoothedX = lastHandPosition.x + (handX - lastHandPosition.x) * SMOOTHING_FACTOR;
    const smoothedY = lastHandPosition.y + (handY - lastHandPosition.y) * SMOOTHING_FACTOR;

    // Update tracker position
    handTracker.style.left = (canvasRect.left + smoothedX) + 'px';
    handTracker.style.top = (canvasRect.top + smoothedY) + 'px';

    // Check for pinch gesture (drawing)
    const isPinching = distance < PINCH_THRESHOLD;

    if (isPinching) {
        if (!isDrawingWithHand) {
            // Start drawing - initialize the path
            isDrawingWithHand = true;
            if (handTracker) handTracker.classList.add('drawing');
            
            // FIX: Set lastHandPosition BEFORE moveTo so first segment is correct
            lastHandPosition = { x: smoothedX, y: smoothedY };

            // Set up drawing style on main canvas
            mainCtx.strokeStyle = window.currentColor || '#202124';
            mainCtx.lineWidth = 3;
            mainCtx.lineCap = 'round';
            mainCtx.lineJoin = 'round';
            mainCtx.globalCompositeOperation = 'source-over';
            
            // Start a new path on the main canvas
            mainCtx.beginPath();
            mainCtx.moveTo(smoothedX, smoothedY);
        } else {
            // Continue drawing — guard for detached context
            if (!mainCtx) { mainCtx = mainCanvas ? mainCanvas.getContext('2d') : null; }
            if (!mainCtx) return;
            mainCtx.lineTo(smoothedX, smoothedY);
            mainCtx.stroke();
            
            // FIX: Normalize against canvasRect dimensions (CSS pixels) not canvas.width (buffer pixels)
            // canvasRect.width matches the coordinate space of smoothedX/smoothedY
            if (typeof broadcastDraw === 'function') {
                broadcastDraw({
                    tool: 'pen',
                    fromX: lastHandPosition.x / canvasRect.width,
                    fromY: lastHandPosition.y / canvasRect.height,
                    toX: smoothedX / canvasRect.width,
                    toY: smoothedY / canvasRect.height,
                    color: window.currentColor || '#202124',
                    lineWidth: 3,
                    isEraser: false
                });
            }
            
            // Update last position for next segment
            lastHandPosition = { x: smoothedX, y: smoothedY };
        }
    } else {
        if (isDrawingWithHand) {
            // Stop drawing - send final canvas state for perfect sync
            isDrawingWithHand = false;
            if (handTracker) handTracker.classList.remove('drawing');
            if (typeof sendCanvasState === 'function') sendCanvasState();
        }
    }

    // Update last position for non-drawing movement
    if (!isPinching) {
        lastHandPosition = { x: smoothedX, y: smoothedY };
    }

    // Ensure tracker is visible when hand is detected
    if (handTracker) handTracker.classList.add('active');
}

// Toggle hand tracking
function toggleHandTracking() {
    if (isHandTrackingActive) {
        stopHandTracking();
    } else {
        startHandTracking();
    }
}

// Event listener for hand tracking button
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements
    initDOMElements();

    if (handTrackingBtn) {
        // FIX: Do NOT use stopPropagation — it breaks event bubbling to parent handlers.
        // Instead use a simple click listener that specifically handles this button.
        handTrackingBtn.addEventListener('click', () => {
            console.log('[HandTracking] Button clicked, active:', isHandTrackingActive);
            toggleHandTracking();
        });
    } else {
        console.warn('[HandTracking] Button not found — will retry on first toggle call');
    }
});

// Expose functions globally
window.startHandTracking = startHandTracking;
window.stopHandTracking = stopHandTracking;
window.toggleHandTracking = toggleHandTracking;
