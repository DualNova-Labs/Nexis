// API_URL and WS_URL are set globally by Scripts/config.js
const API_URL = window.API_URL || 'http://localhost:3001';
const WS_URL = window.WS_URL || 'ws://localhost:3001';

const roomSelection = document.getElementById('roomSelection');
const createRoomDiv = document.getElementById('createRoom');
const joinRoomDiv = document.getElementById('joinRoom');
const screenRoom = document.getElementById('screenRoom');
const newRoomIdSpan = document.getElementById('newRoomId');
const roomIdSpan = document.getElementById('roomId');
const roomIdInput = document.getElementById('roomIdInput');
const screenVideo = document.getElementById('screenVideo');
const startShareBtn = document.getElementById('startShareBtn');
const stopShareBtn = document.getElementById('stopShareBtn');

// WebRTC configuration with TURN servers (using Open Relay Project - free public TURN servers)
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' },
        {
            urls: 'turn:a.relay.metered.ca:80',
            username: 'e8dd65b92aad9a38fbaab7e4',
            credential: 'XhvkOYxj2ckQNNpE'
        },
        {
            urls: 'turn:a.relay.metered.ca:80?transport=tcp',
            username: 'e8dd65b92aad9a38fbaab7e4',
            credential: 'XhvkOYxj2ckQNNpE'
        },
        {
            urls: 'turn:a.relay.metered.ca:443',
            username: 'e8dd65b92aad9a38fbaab7e4',
            credential: 'XhvkOYxj2ckQNNpE'
        },
        {
            urls: 'turn:a.relay.metered.ca:443?transport=tcp',
            username: 'e8dd65b92aad9a38fbaab7e4',
            credential: 'XhvkOYxj2ckQNNpE'
        }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

let screenStream = null;
let peerConnection = null;
let ws = null;
let currentRoomId = null;
let isInitiator = false;
let currentQuality = 'high'; // Default quality for screen sharing
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let pendingIceCandidates = []; // Queue for ICE candidates that arrive before peer connection is ready

// Get user details from localStorage
let userDetails = null;
try {
    userDetails = JSON.parse(localStorage.getItem('userDetails')) || JSON.parse(sessionStorage.getItem('userDetails'));
} catch (e) {
    userDetails = null;
}

if (!userDetails || !userDetails.email) {
    window.location.href = './login.html';
}

// Session validation: Only allow one active login
async function validateSession() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/user/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.status === 401 && data.code === "SESSION_INVALIDATED") {
            alert(data.msg);
            stopSharing(); // Proper cleanup
        }
    } catch (err) {
        console.error('Session validation error:', err);
    }
}

// Initial check and periodic verification
validateSession();
setInterval(validateSession, 30000); // Check every 30 seconds

// Initialize WebSocket connection
function initializeWebSocket() {
    if (ws) {
        ws.close();
    }

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket connected');
        // FIX #1: Reset reconnect counter on successful connection
        reconnectAttempts = 0;
        if (currentRoomId) {
            sendMessage({
                type: 'join',
                room: currentRoomId,
                email: userDetails.email
            });
        }
    };

    ws.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message.type);

            switch (message.type) {
                case 'user-joined':
                    console.log('👤 User joined:', message.email);
                    isInitiator = true;
                    // If we are already sharing, send offer to the new user
                    if (screenStream) {
                        console.log('🎬 Already sharing, initiating negotiation...');
                        await createAndSendOffer();
                    }
                    break;
                case 'offer':
                    console.log('📥 Received offer, handling...');
                    await handleOffer(message.offer);
                    break;
                case 'answer':
                    console.log('📥 Received answer, handling...');
                    await handleAnswer(message.answer);
                    break;
                case 'ice-candidate':
                    console.log('🧊 Received ICE candidate');
                    await handleIceCandidate(message.candidate);
                    break;
                case 'user-left':
                    console.log('👋 User left:', message.email);
                    handleUserLeft();
                    break;
                case 'room-info':
                    console.log('ℹ️ Room info received, participants:', message.participants);
                    break;
                case 'error':
                    console.error('❌ Server error:', message.message);
                    handleError({ message: message.message });
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(() => {
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                initializeWebSocket();
            }, 5000 * reconnectAttempts);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Initialize peer connection
async function createPeerConnection() {
    try {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        peerConnection = new RTCPeerConnection(configuration);
        console.log('Created new peer connection');

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate');
                sendMessage({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    room: currentRoomId
                });
            }
        };

        peerConnection.ontrack = (event) => {
            console.log('✅ Received remote track');
            if (event.streams && event.streams[0]) {
                if (screenVideo.srcObject !== event.streams[0]) {
                    screenVideo.srcObject = event.streams[0];
                    console.log('Set remote screen stream');
                }
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                console.log('ICE connection failed, restarting...');
                peerConnection.restartIce();
            } else if (peerConnection.iceConnectionState === 'connected') {
                console.log('✅ ICE connection established!');
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
        };

        peerConnection.onsignalingstatechange = () => {
            console.log('📡 Signaling state:', peerConnection.signalingState);
        };

        // FIX #3: Only add tracks if screenStream exists AND
        // tracks are not already added (prevent duplication on renegotiation)
        if (screenStream) {
            const existingSenders = peerConnection.getSenders();
            screenStream.getTracks().forEach(track => {
                const alreadyAdded = existingSenders.find(s => s.track && s.track.id === track.id);
                if (!alreadyAdded) {
                    peerConnection.addTrack(track, screenStream);
                    console.log('Added track:', track.kind);
                }
            });
        }

        // Process any queued ICE candidates
        await processPendingIceCandidates();

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw error;
    }
}

// Create and send offer with bandwidth constraints
async function createAndSendOffer() {
    try {
        if (!peerConnection) {
            await createPeerConnection();
        }

        console.log('🎬 Creating and sending offer');
        const offer = await peerConnection.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true
        });

        // Add bandwidth constraints (if in production/low bandwidth environment)
        offer.sdp = updateBandwidthRestriction(offer.sdp, getBitrateForQuality(currentQuality));

        await peerConnection.setLocalDescription(offer);
        sendMessage({
            type: 'offer',
            offer: offer,
            room: currentRoomId
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Handle incoming offer with stable check and rollback
async function handleOffer(offer) {
    try {
        if (!peerConnection) {
            await createPeerConnection();
        }

        if (peerConnection.signalingState !== 'stable') {
            console.log('📡 Signaling state not stable, rolling back');
            await Promise.all([
                peerConnection.setLocalDescription({ type: "rollback" }),
                peerConnection.setRemoteDescription(offer)
            ]);
        } else {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        }
        
        console.log('✅ Set remote description from offer');

        // Process any queued ICE candidates now that we have remote description
        await processPendingIceCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('✅ Created and set local description (answer)');

        sendMessage({
            type: 'answer',
            answer: answer,
            room: currentRoomId
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

// Handle incoming answer
async function handleAnswer(answer) {
    try {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Set remote description from answer');

            // Process any queued ICE candidates now that we have remote description
            await processPendingIceCandidates();
        }
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

// Handle incoming ICE candidate
async function handleIceCandidate(candidate) {
    try {
        if (peerConnection && peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Added ICE candidate');
        } else {
            // Queue the candidate if peer connection isn't ready
            console.log('Queuing ICE candidate - peer connection not ready');
            pendingIceCandidates.push(candidate);
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
}

// Process queued ICE candidates
async function processPendingIceCandidates() {
    if (peerConnection && peerConnection.remoteDescription) {
        console.log(`Processing ${pendingIceCandidates.length} pending ICE candidates`);
        for (const candidate of pendingIceCandidates) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added queued ICE candidate');
            } catch (error) {
                console.warn('Error adding queued ICE candidate:', error);
            }
        }
        pendingIceCandidates = [];
    }
}

// Handle user leaving
function handleUserLeft() {
    console.log('Remote user left');
    if (screenVideo.srcObject) {
        // Clear remote stream if it's not our local stream
        // In simple 1-to-1, we can just check if screenStream is different
        if (screenVideo.srcObject !== screenStream) {
            screenVideo.srcObject = null;
        }
    }
}

// Send message through WebSocket
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('Sending message:', message.type);
        ws.send(JSON.stringify(message));
    } else {
        console.error('WebSocket is not connected');
    }
}

// Function to enter a newly created room
async function enterRoom() {
    const roomId = newRoomIdSpan.textContent;
    if (!roomId) {
        alert('No room ID found');
        return;
    }
    currentRoomId = roomId;
    isInitiator = true;
    await startScreenRoom(roomId);
    // FIX #2: Join message is now sent inside startScreenRoom after WS is guaranteed open
}

// Function to join an existing room
async function joinExistingRoom() {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }
    currentRoomId = roomId;
    isInitiator = false;
    await startScreenRoom(roomId);
    // FIX #2: Join message is now sent inside startScreenRoom after WS is guaranteed open
}

// FIX #2: Helper to send join after WS is confirmed open
function sendJoinMessage(roomId) {
    sendMessage({
        type: 'join',
        room: roomId,
        email: userDetails.email
    });
}

// Function to start the screen share room
async function startScreenRoom(roomId) {
    try {
        // FIX #4: Do NOT override display here — let screenshare.html wrapper handle it
        // Only update the room ID label
        roomIdSpan.textContent = roomId;

        await createPeerConnection();

        startShareBtn.disabled = false;
        stopShareBtn.disabled = true;

        // FIX #2: Guarantee WS is open before sending join, with proper fallback
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            // WS not open — init it; onopen handler will call the join automatically
            initializeWebSocket();
        } else if (ws.readyState === WebSocket.CONNECTING) {
            // WS is still connecting — wait for it to open
            ws.addEventListener('open', () => sendJoinMessage(roomId), { once: true });
        } else {
            // WS already open — send immediately
            sendJoinMessage(roomId);
        }
    } catch (error) {
        console.error('Error starting screen room:', error);
        alert('Failed to start screen sharing room. Please try again.');
    }
}

// Event listeners for screen share controls
startShareBtn.addEventListener('click', async () => {
    try {
        // FIX #5: Enhanced getDisplayMedia constraints for better quality
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                frameRate: { ideal: 30, max: 60 },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });

        screenVideo.srcObject = screenStream;

        // FIX #3: Add tracks to peer connection, avoiding duplicates
        console.log('Adding tracks to peer connection');
        const existingSenders = peerConnection.getSenders();
        screenStream.getTracks().forEach(track => {
            const alreadyAdded = existingSenders.find(s => s.track && s.track.id === track.id);
            if (!alreadyAdded) {
                peerConnection.addTrack(track, screenStream);
                console.log('Added track:', track.kind);
            }
        });

        // Always trigger negotiation when we start sharing
        await createAndSendOffer();

        // Listen for when user stops sharing through browser controls
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.addEventListener('ended', () => stopSharing());
        }

        startShareBtn.disabled = true;
        stopShareBtn.disabled = false;
    } catch (error) {
        console.error('Error starting screen share:', error);
        if (error.name !== 'NotAllowedError') {
            // Don't alert if user simply cancelled the picker
            alert('Failed to start screen sharing. Please try again.');
        }
    }
});

stopShareBtn.addEventListener('click', stopSharing);

function stopSharing() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenVideo.srcObject = null;
        screenStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    sendMessage({
        type: 'leave',
        room: currentRoomId,
        email: userDetails.email
    });

    window.location.href = './dashboard.html';
}

// --- Utility Functions (Synced from video.js) ---

function updateBandwidthRestriction(sdp, bandwidth) {
    let modifier = 'AS';
    if (sdp.indexOf('b=' + modifier + ':') === -1) {
        sdp = sdp.replace(/c=IN (.*)\r\n/g, 'c=IN $1\r\nb=' + modifier + ':' + bandwidth + '\r\n');
    } else {
        sdp = sdp.replace(new RegExp('b=' + modifier + ':.*\r\n'), 'b=' + modifier + ':' + bandwidth + '\r\n');
    }
    return sdp;
}

function getBitrateForQuality(quality) {
    switch (quality) {
        case 'high': return 3000; // 3 Mbps for screen sharing
        case 'medium': return 1500;
        case 'low': return 750;
        default: return 2000;
    }
}

function handleError(error) {
    console.error('❌ Connection error:', error);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#d93025;color:white;padding:12px 24px;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);font-weight:500;';
    errorDiv.textContent = error.message || 'Connection error. Please refresh.';
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// Check URL parameters for action
const urlParams = new URLSearchParams(window.location.search);
const action = urlParams.get('action');

// Initialize room based on action
if (action === 'create') {
    const newRoomId = Math.random().toString(36).substring(7);
    newRoomIdSpan.textContent = newRoomId;
    createRoomDiv.style.display = 'block';
    joinRoomDiv.style.display = 'none';
} else if (action === 'join') {
    createRoomDiv.style.display = 'none';
    joinRoomDiv.style.display = 'block';
} else {
    window.location.href = './dashboard.html';
}

// Initialize WebSocket connection
initializeWebSocket();