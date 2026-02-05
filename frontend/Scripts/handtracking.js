// Hand Tracking Module using MediaPipe Hands
// This module enables drawing on the whiteboard using hand gestures

let hands = null;
let camera = null;
let isHandTrackingActive = false;
let isDrawingWithHand = false;
let lastHandPosition = { x: 0, y: 0 };

// DOM Elements
const videoElement = document.getElementById('inputVideo');
const outputCanvas = document.getElementById('outputCanvas');
const outputCtx = outputCanvas.getContext('2d');
const cameraPreview = document.getElementById('cameraPreview');
const handTracker = document.getElementById('handTracker');
const handTrackingBtn = document.getElementById('handTrackingBtn');
const mainCanvas = document.getElementById('canvas');
const mainCtx = mainCanvas.getContext('2d');

// Configuration
const PINCH_THRESHOLD = 0.05; // Distance between thumb and index to trigger pinch
const SMOOTHING_FACTOR = 0.3; // For smoothing hand movement

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

    try {
        // Request camera permission
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 320,
                height: 240,
                facingMode: 'user'
            } 
        });

        // Initialize MediaPipe
        initHandTracking();

        // Set up camera
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (hands) {
                    await hands.send({ image: videoElement });
                }
            },
            width: 320,
            height: 240
        });

        await camera.start();

        // Show UI elements
        cameraPreview.classList.add('active');
        handTracker.classList.add('active');
        handTrackingBtn.classList.add('active');
        
        isHandTrackingActive = true;
        
        // Set canvas output size
        outputCanvas.width = 320;
        outputCanvas.height = 240;

    } catch (error) {
        console.error('Error starting hand tracking:', error);
        alert('Unable to access camera. Please ensure camera permissions are granted.');
        stopHandTracking();
    }
}

// Stop hand tracking
function stopHandTracking() {
    if (!isHandTrackingActive) return;

    isHandTrackingActive = false;
    isDrawingWithHand = false;

    // Stop camera
    if (camera) {
        camera.stop();
        camera = null;
    }

    // Hide UI elements
    cameraPreview.classList.remove('active');
    handTracker.classList.remove('active');
    handTracker.classList.remove('drawing');
    handTrackingBtn.classList.remove('active');

    // Clear output canvas
    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
}

// Process hand detection results
function onHandResults(results) {
    // Clear output canvas
    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        // No hand detected
        handTracker.classList.remove('active');
        isDrawingWithHand = false;
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
            handTracker.classList.add('drawing');
            
            // Start a new path on the main canvas
            mainCtx.beginPath();
            mainCtx.moveTo(smoothedX, smoothedY);
        } else {
            // Continue drawing
            mainCtx.lineTo(smoothedX, smoothedY);
            mainCtx.stroke();
        }
    } else {
        if (isDrawingWithHand) {
            // Stop drawing
            isDrawingWithHand = false;
            handTracker.classList.remove('drawing');
        }
    }

    // Update last position
    lastHandPosition = { x: smoothedX, y: smoothedY };

    // Ensure tracker is visible
    handTracker.classList.add('active');
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
    if (handTrackingBtn) {
        handTrackingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleHandTracking();
        });
    }
});

// Expose functions globally
window.startHandTracking = startHandTracking;
window.stopHandTracking = stopHandTracking;
window.toggleHandTracking = toggleHandTracking;
