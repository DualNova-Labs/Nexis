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
    if (!videoElement) {
        initDOMElements();
    }

    // Validate required elements exist
    if (!videoElement || !outputCanvas || !cameraPreview || !mainCanvas) {
        console.error('Hand tracking: Required DOM elements not found');
        alert('Hand tracking initialization failed. Please refresh the page.');
        return;
    }

    try {
        console.log('Starting hand tracking...');

        // Initialize MediaPipe Hands
        initHandTracking();

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
        
        isHandTrackingActive = true;
        
        // Set canvas output size
        outputCanvas.width = 320;
        outputCanvas.height = 240;

    } catch (error) {
        console.error('Error starting hand tracking:', error);
        alert('Unable to access camera. Please ensure camera permissions are granted and try again.');
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
        try {
            camera.stop();
        } catch (e) {
            console.warn('Error stopping camera:', e);
        }
        camera = null;
    }

    // Hide UI elements
    if (cameraPreview) cameraPreview.classList.remove('active');
    if (handTracker) {
        handTracker.classList.remove('active');
        handTracker.classList.remove('drawing');
    }
    if (handTrackingBtn) handTrackingBtn.classList.remove('active');

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
            // Start drawing
            isDrawingWithHand = true;
            if (handTracker) handTracker.classList.add('drawing');
            
            // Set up drawing style on main canvas
            mainCtx.strokeStyle = window.currentColor || '#202124';
            mainCtx.lineWidth = 3;
            mainCtx.lineCap = 'round';
            mainCtx.lineJoin = 'round';
            mainCtx.globalCompositeOperation = 'source-over';
            
            // Start a new path on the main canvas
            mainCtx.beginPath();
            mainCtx.moveTo(smoothedX, smoothedY);
            
            // Store start position for broadcast
            lastHandPosition = { x: smoothedX, y: smoothedY };
        } else {
            // Continue drawing
            mainCtx.lineTo(smoothedX, smoothedY);
            mainCtx.stroke();
            
            // Broadcast hand draw stroke to other users
            if (typeof broadcastDraw === 'function') {
                broadcastDraw({
                    tool: 'pen',
                    fromX: lastHandPosition.x,
                    fromY: lastHandPosition.y,
                    toX: smoothedX,
                    toY: smoothedY,
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
            // Stop drawing
            isDrawingWithHand = false;
            if (handTracker) handTracker.classList.remove('drawing');
        }
    }

    // Update last position
    lastHandPosition = { x: smoothedX, y: smoothedY };

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
        handTrackingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Hand tracking button clicked');
            toggleHandTracking();
        });
    } else {
        console.warn('Hand tracking button not found');
    }
});

// Expose functions globally
window.startHandTracking = startHandTracking;
window.stopHandTracking = stopHandTracking;
window.toggleHandTracking = toggleHandTracking;
