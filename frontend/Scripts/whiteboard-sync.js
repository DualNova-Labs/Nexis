(function() {
// Whiteboard Sync Module - Real-time collaboration via WebSocket
// Handles syncing canvas state between users in the same room

let wsConnection = null;
let currentRoom = null;
let isConnected = false;
let reconnectAttempts = 0;
let keepAliveTimer = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const KEEPALIVE_INTERVAL = 20000; // 20s — under Railway/Caddy's ~30s idle timeout

// ──────────────────────────────────────────────────────────────
// Connection Status Indicator (visible in UI)
// ──────────────────────────────────────────────────────────────
function setConnectionStatus(state) {
    // state: 'connected' | 'connecting' | 'disconnected'
    let indicator = document.getElementById('wb-conn-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'wb-conn-status';
        indicator.style.cssText = [
            'position:fixed', 'bottom:16px', 'right:16px', 'z-index:9999',
            'display:flex', 'align-items:center', 'gap:6px',
            'padding:6px 12px', 'border-radius:20px',
            'font-size:12px', 'font-weight:600',
            'background:rgba(0,0,0,0.75)', 'color:#fff',
            'pointer-events:none', 'user-select:none',
            'transition:opacity 0.3s'
        ].join(';');
        document.body.appendChild(indicator);
    }
    const dot = '<span style="width:8px;height:8px;border-radius:50%;display:inline-block;background:';
    if (state === 'connected') {
        indicator.innerHTML = dot + '#34a853"></span> Sync: Live';
        indicator.style.opacity = '1';
    } else if (state === 'connecting') {
        indicator.innerHTML = dot + '#fbbc04"></span> Sync: Connecting…';
        indicator.style.opacity = '1';
    } else {
        indicator.innerHTML = dot + '#ea4335"></span> Sync: Disconnected';
        indicator.style.opacity = '1';
    }
}

// ──────────────────────────────────────────────────────────────
// Keep-alive: send lightweight ping every 20 s
// Prevents Railway's Caddy proxy from closing idle WS connections
// ──────────────────────────────────────────────────────────────
function startKeepAlive() {
    stopKeepAlive();
    keepAliveTimer = setInterval(() => {
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            // Send a lightweight ping the server ignores gracefully
            wsConnection.send(JSON.stringify({ type: 'whiteboard-ping', room: currentRoom }));
        }
    }, KEEPALIVE_INTERVAL);
}

function stopKeepAlive() {
    if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
    }
}

// ──────────────────────────────────────────────────────────────
// WebSocket URL
// ──────────────────────────────────────────────────────────────
function getWebSocketUrl() {
    return window.WS_URL || 'ws://localhost:3001';
}

// ──────────────────────────────────────────────────────────────
// Initialize / Re-initialize WebSocket
// Always tears down any old connection and creates a fresh one.
// This avoids silent "already open but not joined" edge cases.
// ──────────────────────────────────────────────────────────────
function initWhiteboardSync(roomId) {
    currentRoom = roomId;

    // Tear down any existing connection cleanly
    if (wsConnection) {
        wsConnection.onclose = null; // prevent triggering reconnect loop
        wsConnection.onerror = null;
        wsConnection.onmessage = null;
        wsConnection.onopen = null;
        if (wsConnection.readyState !== WebSocket.CLOSED) {
            wsConnection.close();
        }
        wsConnection = null;
    }

    stopKeepAlive();

    const wsUrl = getWebSocketUrl();
    console.log(`[WB-Sync] Connecting to ${wsUrl} for room "${roomId}"`);
    setConnectionStatus('connecting');

    try {
        wsConnection = new WebSocket(wsUrl);

        wsConnection.onopen = () => {
            console.log('[WB-Sync] Connected ✓');
            isConnected = true;
            reconnectAttempts = 0;
            setConnectionStatus('connected');
            startKeepAlive();

            // Join the whiteboard room
            sendMessage({
                type: 'whiteboard-join',
                room: currentRoom,
                email: getUserEmail()
            });

            // Request current state from peers (handles late-join case)
            setTimeout(() => {
                sendMessage({
                    type: 'whiteboard-request-state',
                    room: currentRoom
                });
            }, 500);
        };

        wsConnection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleIncomingMessage(message);
            } catch (error) {
                console.error('[WB-Sync] Error parsing message:', error);
            }
        };

        wsConnection.onclose = (evt) => {
            console.warn(`[WB-Sync] Disconnected (code=${evt.code})`);
            isConnected = false;
            setConnectionStatus('disconnected');
            stopKeepAlive();
            attemptReconnect();
        };

        wsConnection.onerror = (error) => {
            console.error('[WB-Sync] WebSocket error:', error);
            setConnectionStatus('disconnected');
        };

    } catch (error) {
        console.error('[WB-Sync] Failed to create WebSocket:', error);
        setConnectionStatus('disconnected');
    }
}

// ──────────────────────────────────────────────────────────────
// Reconnect with exponential backoff
// ──────────────────────────────────────────────────────────────
function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[WB-Sync] Max reconnect attempts reached');
        showNotification('Sync connection lost. Please refresh the page.', 'error');
        return;
    }

    reconnectAttempts++;
    const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 15000);
    console.log(`[WB-Sync] Reconnecting in ${timeout}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…`);

    setTimeout(() => {
        if (currentRoom) {
            initWhiteboardSync(currentRoom);
        }
    }, timeout);
}

// ──────────────────────────────────────────────────────────────
// Send message
// ──────────────────────────────────────────────────────────────
function sendMessage(message) {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify(message));
    } else {
        console.warn('[WB-Sync] Cannot send — not connected:', message.type);
    }
}

// ──────────────────────────────────────────────────────────────
// Incoming message dispatcher
// ──────────────────────────────────────────────────────────────
function handleIncomingMessage(message) {
    switch (message.type) {
        case 'whiteboard-draw':
            // Notify UI when a remote draw stroke starts
            if (message.drawData && message.drawData.type === 'start') {
                notifyDrawingStarted(message.drawData.email);
            }
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
        case 'whiteboard-user-joined': {
            const email = message.email || 'Someone';
            if (email !== getUserEmail()) {
                console.log(`[WB-Sync] ${email} joined`);
                showNotification(`${email.split('@')[0]} joined the whiteboard`, 'info');
                // Push current canvas to the new user
                sendCanvasState();
            }
            break;
        }
        case 'whiteboard-user-left': {
            const email = message.email || 'Someone';
            console.log(`[WB-Sync] ${email} left`);
            showNotification(`${email.split('@')[0]} left the whiteboard`, 'info');
            break;
        }
        case 'whiteboard-ping':
            // Server echoed our ping — ignore
            break;
        case 'error':
            console.error('[WB-Sync] Server error:', message.message);
            showNotification(message.message || 'Server error', 'error');
            break;
        default:
            // Ignore unknown types (e.g. heartbeat pong from other features)
            break;
    }
}

// ──────────────────────────────────────────────────────────────
// Toast notification helper
// ──────────────────────────────────────────────────────────────
function showNotification(message, type = 'info') {
    if (window.toast) {
        if (type === 'success') window.toast.success(message);
        else if (type === 'error') window.toast.error(message);
        else window.toast.info(message);
    } else {
        console.log(`[WB-Sync] ${type.toUpperCase()}: ${message}`);
    }
}

// ──────────────────────────────────────────────────────────────
// Remote draw handler (normalized coordinates → local pixels)
// ──────────────────────────────────────────────────────────────
// remoteSavedState: snapshot taken at the START of each remote stroke so that
// line/rect/circle tools can putImageData on every mousemove frame without
// stacking multiple preview strokes. Reset to null on 'stop'.
let remoteSavedState = null;

function handleRemoteDraw(data) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    // data IS the drawData object (already unwrapped by handleIncomingMessage)
    if (!ctx || !data) return;

    const email = data.email || 'Someone';

    // ── Lifecycle events ──────────────────────────────────────────
    if (data.type === 'start') {
        showDrawingStatus(email, true);
        // Capture the canvas BEFORE this stroke begins so shape tools can
        // restore it on every intermediate frame (live preview).
        remoteSavedState = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return;
    }

    if (data.type === 'stop') {
        showDrawingStatus(email, false);
        // After the full-state snapshot arrives we no longer need the saved state.
        remoteSavedState = null;
        return;
    }

    // ── Stroke rendering (data.type === 'draw' or legacy) ─────────
    ctx.strokeStyle = data.color || '#202124';
    ctx.lineWidth   = data.lineWidth || 3;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    if (data.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = data.lineWidth || 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
    }

    // Denormalize: coordinates arrive as 0–1 fractions of sender's canvas.
    const fromX  = (data.fromX  || 0) * canvas.width;
    const fromY  = (data.fromY  || 0) * canvas.height;
    const toX    = (data.toX    || 0) * canvas.width;
    const toY    = (data.toY    || 0) * canvas.height;
    const startX = (data.startX || 0) * canvas.width;
    const startY = (data.startY || 0) * canvas.height;

    switch (data.tool) {
        case 'pen': {
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
            break;
        }
        case 'line': {
            if (remoteSavedState) ctx.putImageData(remoteSavedState, 0, 0);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
            break;
        }
        case 'rectangle': {
            if (remoteSavedState) ctx.putImageData(remoteSavedState, 0, 0);
            const w = (data.width  || 0) * canvas.width;
            const h = (data.height || 0) * canvas.height;
            ctx.beginPath();
            ctx.strokeRect(startX, startY, w, h);
            break;
        }
        case 'circle': {
            if (remoteSavedState) ctx.putImageData(remoteSavedState, 0, 0);
            const diagLen = Math.sqrt(canvas.width ** 2 + canvas.height ** 2) / Math.sqrt(2);
            const radius  = (data.radius || 0) * diagLen;
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
    }
}

// Track whether the status pill is currently showing so the hide-timeout
// doesn't accidentally hide a subsequent 'show' call.
let _statusVisible = false;

function showDrawingStatus(email, isDrawing) {
    let statusEl = document.getElementById('wb-drawing-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'wb-drawing-status';
        // Use display:flex from the start; visibility is controlled by opacity + pointer-events.
        Object.assign(statusEl.style, {
            position:       'absolute',
            top:            '12px',
            left:           '50%',
            transform:      'translateX(-50%)',
            background:     'rgba(26, 115, 232, 0.9)',
            color:          'white',
            padding:        '6px 16px',
            borderRadius:   '20px',
            fontSize:       '13px',
            fontWeight:     '500',
            zIndex:         '100',
            pointerEvents:  'none',
            display:        'flex',
            alignItems:     'center',
            gap:            '8px',
            boxShadow:      '0 4px 12px rgba(0,0,0,0.2)',
            transition:     'opacity 0.3s ease',
            opacity:        '0',
            whiteSpace:     'nowrap'
        });
        const container = document.querySelector('.wb-canvas-container');
        if (container) container.appendChild(statusEl);

        // Inject pulse keyframe once
        if (!document.getElementById('wb-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'wb-pulse-style';
            style.textContent = `
                @keyframes wbPulse {
                    0%,100% { transform: scale(1); opacity: 1; }
                    50%      { transform: scale(1.2); opacity: 0.7; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    if (isDrawing) {
        _statusVisible = true;
        const name = email.split('@')[0];
        statusEl.innerHTML =
            `<span class="material-icons-outlined" style="font-size:16px;animation:wbPulse 1.5s infinite;">edit</span>&nbsp;${name} is drawing…`;
        statusEl.style.opacity = '1';

        // Highlight the remote participant name tag
        const remoteTag = document.querySelector('.v-remote-tile div');
        if (remoteTag) {
            remoteTag.style.background = 'rgba(26, 115, 232, 0.8)';
            remoteTag.innerHTML =
                `<span style="display:flex;align-items:center;gap:4px;">
                    <i class="material-icons-outlined" style="font-size:14px;">draw</i> ${name} (Drawing)
                </span>`;
        }
    } else {
        _statusVisible = false;
        statusEl.style.opacity = '0';
        // Only hide from layout after fade completes AND no new show() fired.
        setTimeout(() => {
            if (!_statusVisible) statusEl.style.opacity = '0';
        }, 350);

        // Reset remote participant tag
        const remoteTag = document.querySelector('.v-remote-tile div');
        if (remoteTag) {
            remoteTag.style.background = 'rgba(0,0,0,0.5)';
            remoteTag.textContent = 'Remote Participant';
        }
    }
}

// ──────────────────────────────────────────────────────────────
// Full canvas state — received from server or peer
// ──────────────────────────────────────────────────────────────
function handleRemoteState(state) {
    if (!state) return;
    const canvas = document.getElementById('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        console.log('[WB-Sync] Canvas state applied');
    };
    img.onerror = () => console.error('[WB-Sync] Failed to load canvas state image');
    img.src = state;
}

// ──────────────────────────────────────────────────────────────
// Remote clear
// ──────────────────────────────────────────────────────────────
function handleRemoteClear() {
    const canvas = document.getElementById('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// ──────────────────────────────────────────────────────────────
// State request handler — another user asked for our canvas
// ──────────────────────────────────────────────────────────────
function handleStateRequest() {
    sendCanvasState();
}

// ──────────────────────────────────────────────────────────────
// Send full canvas snapshot (JPEG at 70% quality to keep size under 500KB)
// ──────────────────────────────────────────────────────────────
function sendCanvasState() {
    const canvas = document.getElementById('canvas');
    if (!canvas || !currentRoom) return;

    // Use JPEG at 0.7 quality — ~5-10x smaller than PNG, plenty for whiteboard
    const state = canvas.toDataURL('image/jpeg', 0.7);
    sendMessage({
        type: 'whiteboard-state',
        room: currentRoom,
        state: state
    });
    console.log('[WB-Sync] Canvas state sent');
}

// ──────────────────────────────────────────────────────────────
// Broadcast helpers
// ──────────────────────────────────────────────────────────────
function broadcastDraw(drawData) {
    if (!currentRoom) return;
    sendMessage({ 
        type: 'whiteboard-draw', 
        room: currentRoom, 
        drawData: { ...drawData, email: getUserEmail() } 
    });
}

function broadcastClear() {
    if (!currentRoom) return;
    sendMessage({ type: 'whiteboard-clear', room: currentRoom });
}

// ──────────────────────────────────────────────────────────────
// Get user email
// ──────────────────────────────────────────────────────────────
function getUserEmail() {
    try {
        const raw = localStorage.getItem('userDetails') || sessionStorage.getItem('userDetails');
        const user = raw ? JSON.parse(raw) : null;
        return user?.email || 'anonymous';
    } catch {
        return 'anonymous';
    }
}

// ──────────────────────────────────────────────────────────────
// Disconnect
// ──────────────────────────────────────────────────────────────
function disconnectWhiteboardSync() {
    stopKeepAlive();
    if (wsConnection) {
        wsConnection.onclose = null;
        wsConnection.close();
        wsConnection = null;
    }
    isConnected = false;
    currentRoom = null;
    setConnectionStatus('disconnected');
}

function notifyDrawingStarted(email) {
    // Highlight the whiteboard button only when the panel is closed.
    const wbBtn = document.getElementById('toggleWhiteboardBtn');
    if (!wbBtn || wbBtn.classList.contains('active')) return;

    // Button needs position:relative for the badge to be positioned correctly.
    wbBtn.style.position = 'relative';
    wbBtn.style.boxShadow = '0 0 15px #1a73e8';

    // Inject badge as a sibling element instead of innerHTML (preserves icon child).
    let badge = document.getElementById('wb-activity-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'wb-activity-badge';
        Object.assign(badge.style, {
            position:     'absolute',
            top:          '-4px',
            right:        '-4px',
            width:        '10px',
            height:       '10px',
            background:   '#ea4335',
            borderRadius: '50%',
            border:       '2px solid #202124',
            pointerEvents:'none'
        });
        wbBtn.appendChild(badge);
    }
    badge.style.display = 'block';
}

// ──────────────────────────────────────────────────────────────
// Global exports
// ──────────────────────────────────────────────────────────────
window.initWhiteboardSync     = initWhiteboardSync;
window.broadcastDraw          = broadcastDraw;
window.broadcastClear         = broadcastClear;
window.sendCanvasState        = sendCanvasState;
window.disconnectWhiteboardSync = disconnectWhiteboardSync;

})();
