// Whiteboard Sync Module - Real-time collaboration via WebSocket
// This module handles syncing canvas state between users in the same room

let wsConnection = null;
let currentRoom = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

// Get WebSocket URL based on current location
function getWebSocketUrl() {
    // Use global WS_URL set by config.js (supports both local and production)
    return window.WS_URL || 'ws://localhost:3001';
}

// Initialize WebSocket connection
function initWhiteboardSync(roomId) {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected');
        return;
    }

    currentRoom = roomId;
    const wsUrl = getWebSocketUrl();
    console.log(`Connecting to WebSocket at ${wsUrl} for room ${roomId}`);

    try {
        wsConnection = new WebSocket(wsUrl);

        wsConnection.onopen = () => {
            console.log('WebSocket connected');
            isConnected = true;
            reconnectAttempts = 0;

            // Join the whiteboard room
            sendMessage({
                type: 'whiteboard-join',
                room: currentRoom,
                email: getUserEmail()
            });
        };

        wsConnection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleIncomingMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        wsConnection.onclose = () => {
            console.log('WebSocket disconnected');
            isConnected = false;
            attemptReconnect();
        };

        wsConnection.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

    } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
    }
}

// Attempt to reconnect
function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnect attempts reached');
        showNotification('Collaboration connection lost. Please refresh.', 'error');
        return;
    }

    reconnectAttempts++;
    const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
    console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${timeout}ms...`);

    setTimeout(() => {
        if (currentRoom) {
            initWhiteboardSync(currentRoom);
        }
    }, timeout);
}

// Send message through WebSocket
function sendMessage(message) {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify(message));
    } else {
        console.warn('WebSocket not connected, cannot send message');
    }
}

// Handle incoming messages
function handleIncomingMessage(message) {
    console.log('Received message:', message.type);

    switch (message.type) {
        case 'whiteboard-draw':
            handleRemoteDraw(message.drawData);
            break;
        case 'whiteboard-state':
            handleRemoteState(message.state);
            break;
        case 'whiteboard-clear':
            handleRemoteClear();
            break;
        case 'whiteboard-request-state':
            handleStateRequest();
            break;
        case 'user-joined':
            if (message.email !== getUserEmail()) {
                console.log(`User ${message.email} joined the whiteboard`);
                showNotification(`${message.email.split('@')[0]} joined the whiteboard`, 'info');
                // Send current canvas state to new user
                sendCanvasState();
            }
            break;
        case 'user-left':
            console.log(`User ${message.email} left the whiteboard`);
            showNotification(`${message.email.split('@')[0]} left the whiteboard`, 'info');
            break;
        case 'error':
            console.error('Server error:', message.message);
            showNotification(message.message, 'error');
            break;
    }
}

// Notification helper
function showNotification(message, type = 'info') {
    if (window.toast) {
        if (type === 'success') window.toast.success(message);
        else if (type === 'error') window.toast.error(message);
        else window.toast.info(message);
    } else {
        console.log(`${type.toUpperCase()}: ${message}`);
    }
}

// Handle remote draw action
function handleRemoteDraw(drawData) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx || !drawData) return;

    // Apply stroke style
    ctx.strokeStyle = drawData.color || '#202124';
    ctx.lineWidth = drawData.lineWidth || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (drawData.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = drawData.lineWidth || 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
    }

    // Denormalize coordinates based on local canvas size
    const fromX = drawData.fromX * canvas.width;
    const fromY = drawData.fromY * canvas.height;
    const toX   = (drawData.toX   || 0) * canvas.width;
    const toY   = (drawData.toY   || 0) * canvas.height;
    const startX = (drawData.startX || 0) * canvas.width;
    const startY = (drawData.startY || 0) * canvas.height;

    switch (drawData.tool) {
        case 'pen':
            // FIX: beginPath + moveTo + lineTo for correct segment rendering
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
            break;

        case 'line':
            if (drawData.savedState) {
                const img = new Image();
                img.onload = () => {
                    // Restore background then draw shape on top
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    // Re-apply stroke settings after drawImage (context state may shift)
                    ctx.strokeStyle = drawData.color || '#202124';
                    ctx.lineWidth = drawData.lineWidth || 3;
                    ctx.lineCap = 'round';
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(toX, toY);
                    ctx.stroke();
                };
                img.src = drawData.savedState;
            }
            break;

        case 'rectangle':
            if (drawData.savedState) {
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    ctx.strokeStyle = drawData.color || '#202124';
                    ctx.lineWidth = drawData.lineWidth || 3;
                    ctx.globalCompositeOperation = 'source-over';
                    const width  = (drawData.width  || 0) * canvas.width;
                    const height = (drawData.height || 0) * canvas.height;
                    ctx.beginPath();
                    ctx.strokeRect(startX, startY, width, height);
                };
                img.src = drawData.savedState;
            }
            break;

        case 'circle':
            if (drawData.savedState) {
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    ctx.strokeStyle = drawData.color || '#202124';
                    ctx.lineWidth = drawData.lineWidth || 3;
                    ctx.globalCompositeOperation = 'source-over';
                    // FIX: Use same diagLen formula as whiteboard.js
                    const diagLen = Math.sqrt(canvas.width ** 2 + canvas.height ** 2) / Math.sqrt(2);
                    const radius = (drawData.radius || 0) * diagLen;
                    ctx.beginPath();
                    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
                    ctx.stroke();
                };
                img.src = drawData.savedState;
            }
            break;
    }
}

// Handle receiving full canvas state
function handleRemoteState(state) {
    if (!state) return;

    const canvas = document.getElementById('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return;

    console.log('Applying remote canvas state');

    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Scale to fit local canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        console.log('Canvas state applied successfully');
    };
    img.onerror = () => {
        console.error('Failed to load canvas state image');
    };
    img.src = state;
}

// Handle remote clear
function handleRemoteClear() {
    const canvas = document.getElementById('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        console.log('Canvas cleared by remote user');
    }
}

// Handle state request from another user
function handleStateRequest() {
    sendCanvasState();
}

// Send current canvas state to server
function sendCanvasState() {
    const canvas = document.getElementById('canvas');
    if (!canvas || !currentRoom) return;

    const state = canvas.toDataURL('image/png');
    sendMessage({
        type: 'whiteboard-state',
        room: currentRoom,
        state: state
    });
    console.log('Sent canvas state to server');
}

// Broadcast a draw action
function broadcastDraw(drawData) {
    if (!currentRoom) return;

    sendMessage({
        type: 'whiteboard-draw',
        room: currentRoom,
        drawData: drawData
    });
}

// Broadcast canvas clear
function broadcastClear() {
    if (!currentRoom) return;

    sendMessage({
        type: 'whiteboard-clear',
        room: currentRoom
    });
}

// Get user email from localStorage or session
function getUserEmail() {
    try {
        const user = JSON.parse(localStorage.getItem('userDetails') || sessionStorage.getItem('userDetails'));
        return user?.email || 'anonymous';
    } catch {
        return 'anonymous';
    }
}

// Disconnect from WebSocket
function disconnectWhiteboardSync() {
    if (wsConnection) {
        wsConnection.close();
        wsConnection = null;
    }
    isConnected = false;
    currentRoom = null;
    console.log('Disconnected from whiteboard sync');
}

// Expose functions globally
window.initWhiteboardSync = initWhiteboardSync;
window.broadcastDraw = broadcastDraw;
window.broadcastClear = broadcastClear;
window.sendCanvasState = sendCanvasState;
window.disconnectWhiteboardSync = disconnectWhiteboardSync;
