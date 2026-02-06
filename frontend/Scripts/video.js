// Get API base URL - works for both local server and direct file access
const hostname = window.location.hostname || 'localhost';
const API_URL = `http://${hostname}:3001`;
const WS_URL = `ws://${hostname}:3001`;

// Get DOM elements
const roomSelection = document.getElementById('roomSelection');
const createRoomDiv = document.getElementById('createRoom');
const joinRoomDiv = document.getElementById('joinRoom');
const videoRoom = document.getElementById('videoRoom');
const newRoomIdSpan = document.getElementById('newRoomId');
const roomIdSpan = document.getElementById('roomId');
const roomIdInput = document.getElementById('roomIdInput');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallBtn = document.getElementById('startCallBtn');
const endCallBtn = document.getElementById('endCallBtn');
const toggleMuteBtn = document.getElementById('toggleMuteBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const cameraSelect = document.getElementById('cameraSelect');

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

// Video quality presets
const videoQualities = {
    high: { width: 1280, height: 720, frameRate: 30 },
    medium: { width: 640, height: 480, frameRate: 24 },
    low: { width: 320, height: 240, frameRate: 15 }
};

let localStream = null;
let peerConnection = null;
let ws = null;
let currentRoomId = null;
let isInitiator = false;
let currentQuality = 'medium';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let isMuted = false;
let isVideoOff = false;
let pendingIceCandidates = []; // Queue for ICE candidates that arrive before peer connection is ready

// Get user details from sessionStorage instead of localStorage
let userDetails = null;
let isAuthenticated = true;

try {
    userDetails = JSON.parse(sessionStorage.getItem('userDetails'));
} catch (e) {
    userDetails = null;
}

(function() {
    if (!userDetails || !userDetails.email) {
        // If not in sessionStorage, try localStorage and copy to sessionStorage
        let localUserDetails = null;
        try {
            localUserDetails = JSON.parse(localStorage.getItem('userDetails'));
        } catch (e) {
            localUserDetails = null;
        }
        if (localUserDetails && localUserDetails.email) {
            sessionStorage.setItem('userDetails', JSON.stringify(localUserDetails));
            sessionStorage.setItem('token', localStorage.getItem('token'));
            userDetails = localUserDetails; // Set userDetails for use below
            // Don't reload, continue with the flow
        } else {
            // Save current URL parameters before redirecting to login
            const urlParams = new URLSearchParams(window.location.search);
            const roomParam = urlParams.get('room');
            if (roomParam) {
                localStorage.setItem('pendingRoomJoin', roomParam);
            }
            isAuthenticated = false;
            window.location.href = './login.html';
        }
    }
})();

// If not authenticated, the redirect has already happened, so we stop here
if (!isAuthenticated) {
    // Script will not continue past this point as page is redirecting
}

// Initialize WebSocket connection with reconnection
function initializeWebSocket() {
    if (ws) {
        ws.close();
    }

    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        if (currentRoomId) {
            sendMessage({
                type: 'join',
                room: currentRoomId,
                email: userDetails.email
            });
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(() => {
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                initializeWebSocket();
            }, 5000 * reconnectAttempts);
        }
    };
    
    ws.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('📨 Received message:', message.type, message);
            
            switch (message.type) {
                case 'user-joined':
                    console.log('👤 User joined:', message.email, '| I am initiator now');
                    isInitiator = true;
                    console.log('🎬 Creating and sending offer...');
                    await createAndSendOffer();
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
                    console.log('👋 User left');
                    handleUserLeft();
                    break;
                case 'room-info':
                    console.log('ℹ️ Room info received, participants:', message.participants);
                    // If there are existing participants, we're joining an existing room
                    // The initiator (existing user) will send us an offer
                    break;
                case 'error':
                    console.error('❌ Error message:', message);
                    handleError(message);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
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
            // Clean up existing connection
            peerConnection.close();
            peerConnection = null;
        }

        peerConnection = new RTCPeerConnection(configuration);
        console.log('Created new peer connection');
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Generated ICE candidate');
                sendMessage({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    room: currentRoomId
                });
            }
        };
        
        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.streams[0]);
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                console.log('Set remote video stream');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('🔌 ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                console.log('❌ ICE connection failed, restarting...');
                peerConnection.restartIce();
            } else if (peerConnection.iceConnectionState === 'connected') {
                console.log('✅ ICE connection established!');
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', peerConnection.connectionState);
        };

        peerConnection.onsignalingstatechange = () => {
            console.log('📡 Signaling state:', peerConnection.signalingState);
        };

        // Add local stream
        if (localStream) {
            console.log('Adding local stream tracks to peer connection');
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log('Added track:', track.kind);
            });
        }
        
        // Process queued ICE candidates
        await processPendingIceCandidates();
        
        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw error;
    }
}

// Handle incoming offer
async function handleOffer(offer) {
    try {
        console.log('Handling incoming offer');
        if (!peerConnection) {
            await createPeerConnection();
        }
        
        if (peerConnection.signalingState !== 'stable') {
            console.log('Signaling state not stable, rolling back');
            await Promise.all([
                peerConnection.setLocalDescription({type: "rollback"}),
                peerConnection.setRemoteDescription(offer)
            ]);
        } else {
            await peerConnection.setRemoteDescription(offer);
        }
        
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
                console.error('Error adding queued ICE candidate:', error);
            }
        }
        pendingIceCandidates = [];
    }
}

// Handle user leaving
function handleUserLeft() {
    console.log('Remote user left');
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
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
    await startVideoRoom(roomId);
    
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
    await startVideoRoom(roomId);
    
    sendMessage({
        type: 'join',
        room: roomId,
        email: userDetails.email
    });
}

// Function to start the video room
async function startVideoRoom(roomId) {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            initializeWebSocket();
        }
        
        try {
            // First try to release any existing streams
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }

            // Wait a moment for devices to be released
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            let stream;
            
            // Check if test mode is selected
            if (cameraSelect.value === 'test') {
                console.log('Test mode selected, creating test stream');
                stream = createTestStream();
            } else {
                const constraints = {
                    video: cameraSelect.value ? 
                        { deviceId: { exact: cameraSelect.value } } : true,
                    audio: true
                };
                    
                try {
                    stream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch (err) {
                    console.error('getUserMedia error:', err);
                    
                    // If camera is in use, automatically fall back to test mode
                    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                        console.log('Camera in use, automatically switching to test mode...');
                        stream = createTestStream();
                    } else {
                        throw err;
                    }
                }
            }
            
            if (stream) {
                localStream = stream;
                localVideo.srcObject = stream;
                
                roomSelection.style.display = 'none';
                videoRoom.style.display = 'block';
                roomIdSpan.textContent = roomId;
                
                await createPeerConnection();
                
                // Don't send offer here - wait for signaling
                // The initiator will send offer when they see 'user-joined'
                // The joiner will receive offer and respond with answer
                
                startCallBtn.disabled = false;
                endCallBtn.disabled = false;
                toggleMuteBtn.disabled = false;
            } else {
                throw new Error('Failed to get media stream');
            }
        } catch (permissionError) {
            console.error('Permission error:', permissionError);
            handleMediaError(permissionError);
        }
    } catch (error) {
        console.error('Error starting video room:', error);
        alert('Failed to start video call. Please check your camera and microphone connections and try again.');
        roomSelection.style.display = 'block';
        videoRoom.style.display = 'none';
    }
}

// Event listeners for video controls
startCallBtn.addEventListener('click', async () => {
    try {
        if (isInitiator) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Created and set local description (offer)');
            
            sendMessage({
                type: 'offer',
                offer: offer,
                room: currentRoomId
            });
        }
    } catch (error) {
        console.error('Error starting call:', error);
        alert('Failed to start call. Please try again.');
    }
});

endCallBtn.addEventListener('click', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    
    sendMessage({
        type: 'leave',
        room: currentRoomId,
        email: userDetails.email
    });
    window.location.href = './dashboard.html';
});

toggleMuteBtn.addEventListener('click', () => {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach(track => {
            track.enabled = !track.enabled;
        });
        isMuted = !isMuted;
        // Update button UI
        const icon = toggleMuteBtn.querySelector('i');
        if (isMuted) {
            icon.textContent = 'mic_off';
            toggleMuteBtn.classList.remove('active');
        } else {
            icon.textContent = 'mic';
            toggleMuteBtn.classList.add('active');
        }
    }
});

toggleVideoBtn.addEventListener('click', () => {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach(track => {
            track.enabled = !track.enabled;
        });
        isVideoOff = !isVideoOff;
        // Update button UI and video visibility
        const icon = toggleVideoBtn.querySelector('i');
        if (isVideoOff) {
            icon.textContent = 'videocam_off';
            toggleVideoBtn.classList.remove('active');
            localVideo.style.opacity = '0';
        } else {
            icon.textContent = 'videocam';
            toggleVideoBtn.classList.add('active');
            localVideo.style.opacity = '1';
        }
    }
});

// Only run initialization if authenticated
if (isAuthenticated) {
    console.log('✅ User authenticated, initializing video page...');
    
    // Check URL parameters for action
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const roomParam = urlParams.get('room');
    
    console.log('📋 URL action:', action, '| room:', roomParam);
    console.log('📦 DOM elements - createRoomDiv:', createRoomDiv, '| joinRoomDiv:', joinRoomDiv);

    // Initialize room based on action
    if (action === 'create') {
        console.log('🎬 Creating new room...');
        const newRoomId = Math.random().toString(36).substring(7);
        newRoomIdSpan.textContent = newRoomId;
        createRoomDiv.style.display = 'block';
        joinRoomDiv.style.display = 'none';
        console.log('✅ Create room div displayed');
    } else if (action === 'join') {
        console.log('🔗 Joining room...');
        createRoomDiv.style.display = 'none';
        joinRoomDiv.style.display = 'block';
        console.log('✅ Join room div displayed');
        
        // If room code is provided in URL, pre-fill it
        if (roomParam) {
            roomIdInput.value = roomParam;
            // Auto-join if room code is provided
            setTimeout(() => {
                joinExistingRoom();
            }, 500);
        }
    } else {
        console.log('⚠️ No valid action, redirecting to dashboard...');
        window.location.href = './dashboard.html';
    }

    // Initialize WebSocket connection
    initializeWebSocket();
    
    // Load available cameras
    loadCameras();
} else {
    console.log('❌ User not authenticated, redirecting to login...');
}

// Create and send offer with bandwidth constraints
async function createAndSendOffer() {
    try {
        if (!peerConnection) {
            await createPeerConnection();
        }

        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        // Add bandwidth constraints
        const maxBitrate = getBitrateForQuality(currentQuality);
        offer.sdp = updateBandwidthRestriction(offer.sdp, maxBitrate);

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

// Update bandwidth restriction in SDP
function updateBandwidthRestriction(sdp, bandwidth) {
    let modifier = 'AS';
    // Check if adapter is available and if browser is Firefox
    if (typeof adapter !== 'undefined' && adapter.browserDetails && adapter.browserDetails.browser === 'firefox') {
        bandwidth = (bandwidth >>> 0) * 1000;
        modifier = 'TIAS';
    }
    
    if (sdp.indexOf('b=' + modifier + ':') === -1) {
        // Insert b= after c= line
        sdp = sdp.replace(/c=IN (.*)\r\n/, 'c=IN $1\r\nb=' + modifier + ':' + bandwidth + '\r\n');
    } else {
        sdp = sdp.replace(new RegExp('b=' + modifier + ':.*\r\n'), 'b=' + modifier + ':' + bandwidth + '\r\n');
    }
    
    return sdp;
}

// Get bitrate based on quality setting
function getBitrateForQuality(quality) {
    switch (quality) {
        case 'high':
            return 2500; // 2.5 Mbps
        case 'medium':
            return 1000; // 1 Mbps
        case 'low':
            return 500; // 500 Kbps
        default:
            return 1000;
    }
}

// Change video quality
async function changeVideoQuality(quality) {
    if (quality === currentQuality) return;
    
    currentQuality = quality;
    const constraints = {
        video: {
            ...videoQualities[quality],
            facingMode: 'user'
        },
        audio: true
    };
    
    try {
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Replace tracks in peer connection
        const videoTrack = newStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            await sender.replaceTrack(videoTrack);
        }
        
        // Update local video
        localStream.getVideoTracks().forEach(track => track.stop());
        localStream = newStream;
        localVideo.srcObject = newStream;
        
        // Renegotiate with new bitrate
        await createAndSendOffer();
    } catch (error) {
        console.error('Error changing video quality:', error);
    }
}

// Error handling
function handleError(error) {
    console.error('Connection error:', error);
    // Show error to user
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = error.message || 'An error occurred';
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// Handle media errors (camera/microphone access)
function handleMediaError(error) {
    console.error('Media error:', error);
    let message = 'Failed to access camera/microphone. ';
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message += 'Please allow camera and microphone access in your browser settings.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        message += 'No camera or microphone found. Please connect a device.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        message += 'Camera or microphone is already in use by another application.';
    } else {
        message += error.message || 'Unknown error occurred.';
    }
    
    alert(message);
    
    // Return to room selection
    roomSelection.style.display = 'block';
    videoRoom.style.display = 'none';
}

// Add this function after the other utility functions
async function loadCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        cameraSelect.innerHTML = '';
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${cameraSelect.length + 1}`;
            cameraSelect.appendChild(option);
        });

        // Add test mode option
        const testOption = document.createElement('option');
        testOption.value = 'test';
        testOption.text = 'Test Camera';
        cameraSelect.appendChild(testOption);
    } catch (error) {
        console.error('Error loading cameras:', error);
    }
}

// Create fake video stream for testing
function createTestStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    
    // Create animated test pattern
    setInterval(() => {
        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw test pattern
        ctx.fillStyle = '#00ff88';
        ctx.font = '20px Arial';
        ctx.fillText(`Test Stream - Room: ${currentRoomId}`, 20, 40);
        ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, 20, 70);
        
        // Draw moving element
        const time = Date.now() / 1000;
        const x = canvas.width/2 + Math.cos(time) * 100;
        const y = canvas.height/2 + Math.sin(time) * 100;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();
    }, 1000/30); // 30 FPS
    
    return canvas.captureStream(30);
}

// Add event listeners for camera selection and test mode
document.addEventListener('DOMContentLoaded', () => {
    // ... existing event listeners ...
    
    // Load available cameras
    loadCameras();
    
    // Handle camera change
    cameraSelect.addEventListener('change', async () => {
        if (localStream && peerConnection) {
            await startVideoRoom(currentRoomId);
        }
    });
    
    // Request camera permissions to get labels
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            stream.getTracks().forEach(track => track.stop());
            loadCameras();
        })
        .catch(console.error);
}); 