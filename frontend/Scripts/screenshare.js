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
                    console.log('User joined:', message.email);
                    isInitiator = true;
                    // If we are already sharing, send offer to the new user
                    if (screenStream) {
                        console.log('Already sharing, initiating negotiation...');
                        await createAndSendOffer();
                    }
                    break;
                case 'offer':
                    console.log('Received offer');
                    await handleOffer(message.offer);
                    break;
                case 'answer':
                    console.log('Received answer');
                    await handleAnswer(message.answer);
                    break;
                case 'ice-candidate':
                    console.log('Received ICE candidate');
                    await handleIceCandidate(message.candidate);
                    break;
                case 'user-left':
                    console.log('User left:', message.email);
                    handleUserLeft();
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
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
            console.log('Received remote track');
            if (screenVideo.srcObject !== event.streams[0]) {
                screenVideo.srcObject = event.streams[0];
                console.log('Set remote screen stream');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                console.log('ICE connection failed, restarting...');
                peerConnection.restartIce();
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
        };

        // Add screen stream if available
        if (screenStream) {
            console.log('Adding screen stream tracks');
            screenStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, screenStream);
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

// Create and send offer
async function createAndSendOffer() {
    try {
        if (!peerConnection) {
            await createPeerConnection();
        }

        console.log('Creating and sending offer');
        const offer = await peerConnection.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true
        });

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

// Handle incoming offer
async function handleOffer(offer) {
    try {
        if (!peerConnection) {
            await createPeerConnection();
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Set remote description from offer');

        // Process any queued ICE candidates now that we have remote description
        await processPendingIceCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('Created and set local description (answer)');

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

    sendMessage({
        type: 'join',
        room: roomId,
        email: userDetails.email
    });
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

    sendMessage({
        type: 'join',
        room: roomId,
        email: userDetails.email
    });
}

// Function to start the screen share room
async function startScreenRoom(roomId) {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            initializeWebSocket();
        }

        roomSelection.style.display = 'none';
        screenRoom.style.display = 'flex';
        roomIdSpan.textContent = roomId;

        await createPeerConnection();

        startShareBtn.disabled = false;
        stopShareBtn.disabled = true;
    } catch (error) {
        console.error('Error starting screen room:', error);
        alert('Failed to start screen sharing room. Please try again.');
    }
}

// Event listeners for screen share controls
startShareBtn.addEventListener('click', async () => {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        screenVideo.srcObject = screenStream;

        // Add tracks to peer connection
        console.log('Adding tracks to peer connection');
        screenStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, screenStream);
        });

        // Always trigger negotiation when we start sharing
        await createAndSendOffer();

        // Listen for when user stops sharing through browser controls
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopSharing();
        });

        startShareBtn.disabled = true;
        stopShareBtn.disabled = false;
    } catch (error) {
        console.error('Error starting screen share:', error);
        alert('Failed to start screen sharing. Please try again.');
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