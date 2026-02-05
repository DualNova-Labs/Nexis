// Get API base URL - works for both local server and direct file access
const hostname = window.location.hostname || 'localhost';
const API_URL = `http://${hostname}:3001`;

// Get DOM elements
const messageContainer = document.getElementById('messageContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const roomIdSpan = document.getElementById('roomId');
const roomSelection = document.getElementById('roomSelection');
const createRoomDiv = document.getElementById('createRoom');
const joinRoomDiv = document.getElementById('joinRoom');
const chatRoomDiv = document.getElementById('chatRoom');
const newRoomIdSpan = document.getElementById('newRoomId');
const roomIdInput = document.getElementById('roomIdInput');

// Debug logging
console.log('Script loaded');

// Get user details from localStorage
const userDetails = JSON.parse(localStorage.getItem('userDetails'));
console.log('User details:', userDetails);

if (!userDetails || !userDetails.email) {
    console.log('No user details found, redirecting to login');
    window.location.href = './login.html';
    throw new Error('Not logged in');
}

let currentRoomId = null;
let messagePollingInterval = null;

// Function to enter a newly created room
window.enterRoom = function () {
    console.log('Entering room');
    const roomId = newRoomIdSpan.textContent;
    if (!roomId) {
        console.error('No room ID found');
        return;
    }
    console.log('Entering room with ID:', roomId);
    startChat(roomId);
}

// Function to join an existing room
window.joinExistingRoom = function () {
    console.log('Joining existing room');
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }
    console.log('Joining room with ID:', roomId);
    startChat(roomId);
}

// Function to start the chat
function startChat(roomId) {
    console.log('Starting chat in room:', roomId);
    currentRoomId = roomId;

    // Update URL without reloading the page
    window.history.pushState({}, '', `?room=${roomId}`);

    // Hide room selection and show chat
    roomSelection.style.display = 'none';
    chatRoomDiv.style.display = 'flex';
    roomIdSpan.textContent = roomId;

    // Clear any existing polling
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
    }

    // Load initial messages
    loadMessages();

    // Start polling for new messages
    messagePollingInterval = setInterval(loadMessages, 3000);
}

// Load existing messages
async function loadMessages() {
    if (!currentRoomId) {
        console.error('No current room ID');
        return;
    }

    try {
        console.log('Loading messages for room:', currentRoomId);
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const response = await fetch(`${API_URL}/messages/${currentRoomId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (response.status === 401 && data.code === "SESSION_INVALIDATED") {
            alert(data.msg);
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = './login.html';
            return;
        }

        if (data.ok && Array.isArray(data.messages)) {
            displayMessages(data.messages);
        } else {
            console.error('Error in messages data:', data);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Display messages
function displayMessages(messages) {
    console.log('Displaying messages:', messages.length);
    if (!Array.isArray(messages)) {
        console.error('Messages is not an array:', messages);
        return;
    }

    messageContainer.innerHTML = messages.map(msg => `
        <div class="msg-bubble ${msg.sender === userDetails.email ? 'msg-sent' : 'msg-received'}">
            <div class="msg-sender">${msg.sender}</div>
            <div class="msg-text">${msg.content}</div>
            <div class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
        </div>
    `).join('');

    // Auto-scroll to bottom
    setTimeout(() => {
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }, 50);
}

// Send message
async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !currentRoomId) {
        console.error('Missing content or room ID');
        return;
    }

    console.log('Sending message:', { content, room: currentRoomId });

    try {
        const response = await fetch(`${API_URL}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || sessionStorage.getItem('token')}`
            },
            body: JSON.stringify({
                sender: userDetails.email,
                content: content,
                room: currentRoomId
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.msg || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Send message response:', data);

        if (data.ok) {
            messageInput.value = '';
            await loadMessages();
        } else {
            throw new Error(data.msg || 'Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert(error.message || 'Failed to send message. Please try again.');
    }
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); // Prevent default form submission
        sendMessage();
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
    }
});

// Initialize based on URL parameters
const urlParams = new URLSearchParams(window.location.search);
const action = urlParams.get('action');
const roomFromUrl = urlParams.get('room');

console.log('URL Parameters:', { action, roomFromUrl });

// Initialize UI based on URL parameters
if (action === 'create') {
    console.log('Creating new room');
    // Show create room interface
    const newRoomId = Math.random().toString(36).substring(7);
    console.log('Generated room ID:', newRoomId);
    newRoomIdSpan.textContent = newRoomId;
    createRoomDiv.style.display = 'block';
    joinRoomDiv.style.display = 'none';
    chatRoomDiv.style.display = 'none';
} else if (action === 'join') {
    console.log('Showing join room interface');
    // Show join room interface
    createRoomDiv.style.display = 'none';
    joinRoomDiv.style.display = 'block';
    chatRoomDiv.style.display = 'none';
} else if (roomFromUrl) {
    console.log('Room ID found in URL, joining room:', roomFromUrl);
    // If room ID is in URL, directly join that room
    startChat(roomFromUrl);
} else {
    console.log('No valid action or room, redirecting to dashboard');
    window.location.href = './dashboard.html';
} 