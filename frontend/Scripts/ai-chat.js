let chatId = null;
let isProcessing = false;
let currentChatId = null; // Track current chat being viewed

// Get API base URL - works for both local server and direct file access
const hostname = window.location.hostname || 'localhost';
const API_URL = `http://${hostname}:3001`;
const API_CONFIG = {
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    credentials: 'include'
};

// Initialize chat
async function initializeChat() {
    try {
        console.log('Initializing chat...');
        const response = await fetch(`${API_URL}/api/ai/chat/start`, {
            method: 'POST',
            ...API_CONFIG
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Chat initialized:', data);

        if (data.ok) {
            chatId = data.chatId;
            currentChatId = data.chatId;
            console.log('Chat session started with ID:', chatId);
            // Refresh history sidebar
            await loadChatList();
        } else {
            throw new Error(data.error || 'Failed to initialize chat');
        }
    } catch (error) {
        console.error('Error initializing chat:', error);
        showError(`Failed to initialize chat: ${error.message}`);
    }
}

// Load chat list for sidebar
async function loadChatList() {
    try {
        const response = await fetch(`${API_URL}/api/ai/chat/list`, {
            method: 'GET',
            ...API_CONFIG
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Chat list loaded:', data);

        if (data.ok && data.chats) {
            displayChatList(data.chats);
        }
    } catch (error) {
        console.error('Error loading chat list:', error);
    }
}

// Display chat list in sidebar
function displayChatList(chats) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    // Keep the title
    historyList.innerHTML = '<h3 class="history-title">RECENT CHATS</h3>';

    if (chats.length === 0) {
        historyList.innerHTML += '<p style="color: var(--text-gray); font-size: 14px; padding: 12px;">No chat history yet</p>';
        return;
    }

    chats.forEach(chat => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${chat.chatId === currentChatId ? 'active' : ''}`;
        historyItem.onclick = () => loadChat(chat.chatId);

        historyItem.innerHTML = `
            <i class="material-icons-outlined">chat_bubble_outline</i>
            <span>${chat.title || 'New Chat'}</span>
        `;

        historyList.appendChild(historyItem);
    });
}

// Load a specific chat
async function loadChat(selectedChatId) {
    try {
        const response = await fetch(`${API_URL}/api/ai/chat/history/${selectedChatId}`, {
            method: 'GET',
            ...API_CONFIG
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Chat history loaded:', data);

        if (data.ok) {
            // Clear current messages
            const messagesContainer = document.getElementById('chatMessages');
            messagesContainer.innerHTML = '';
            messagesContainer.classList.add('has-messages');

            // Set current chat
            chatId = selectedChatId;
            currentChatId = selectedChatId;

            // Display all messages
            data.history.forEach(msg => {
                appendMessage(msg.content, msg.role === 'assistant');
            });

            // Refresh sidebar to update active state
            await loadChatList();

            // Scroll to bottom after loading messages
            scrollToBottom();
        }
    } catch (error) {
        console.error('Error loading chat:', error);
        showError('Failed to load chat history');
    }
}

// Start new chat
function startNewChat() {
    chatId = null;
    currentChatId = null;
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.classList.remove('has-messages');
    messagesContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">
                <i class="material-icons-outlined">auto_awesome</i>
            </div>
            <h1 class="empty-state-title">Nexis AI Chatbot</h1>
            <p class="empty-state-subtitle">Start a conversation to get assistance</p>
        </div>
    `;
    initializeChat();
}

// Send message
async function sendMessage() {
    if (isProcessing) return;

    const textarea = document.getElementById('chatInput');
    const message = textarea.value.trim();

    if (!message) return;

    // Check if chat is initialized
    if (!chatId) {
        showError('Initializing chat...');
        await initializeChat();
        if (!chatId) {
            showError('Failed to initialize chat. Please refresh the page.');
            return;
        }
    }

    try {
        isProcessing = true;
        textarea.value = '';
        textarea.style.height = 'auto';

        // Show user message immediately
        appendMessage(message, false);
        scrollToBottom();

        // Show typing indicator
        showTypingIndicator();

        console.log('Sending message:', { message, chatId });
        const response = await fetch(`${API_URL}/api/ai/chat/message`, {
            method: 'POST',
            ...API_CONFIG,
            body: JSON.stringify({ message, chatId })
        });

        const data = await response.json();
        console.log('Response received:', data);

        // Remove typing indicator
        hideTypingIndicator();

        if (data.ok) {
            // Stream the AI response with animation
            await appendStreamingMessage(data.response, true);
            scrollToBottom();
            // Refresh chat list to update title
            await loadChatList();
        } else {
            showError(data.error || 'Failed to get response. Please try again.');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        hideTypingIndicator();
        showError('Failed to send message. Please try again.');
    } finally {
        isProcessing = false;
    }
}

// Append message to chat with markdown support
function appendMessage(content, isAi) {
    const messagesContainer = document.getElementById('chatMessages');

    // Remove empty state if present
    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        messagesContainer.innerHTML = '';
        messagesContainer.classList.add('has-messages');
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isAi ? 'ai-message' : 'user-message'}`;

    // Parse markdown for AI messages, escape HTML for user messages
    const displayContent = isAi ? marked.parse(content) : escapeHtml(content);

    messageDiv.innerHTML = `
        <div class="msg-avatar ${isAi ? 'ai' : 'user'}">
            <i class="material-icons-outlined">${isAi ? 'auto_awesome' : 'person'}</i>
        </div>
        <div class="msg-text">${displayContent}</div>
    `;

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

// Append streaming message with typing animation
function appendStreamingMessage(content, isAi) {
    const messagesContainer = document.getElementById('chatMessages');

    // Remove empty state if present
    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        messagesContainer.innerHTML = '';
        messagesContainer.classList.add('has-messages');
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isAi ? 'ai-message' : 'user-message'}`;
    messageDiv.id = 'streaming-message';

    messageDiv.innerHTML = `
        <div class="msg-avatar ${isAi ? 'ai' : 'user'}">
            <i class="material-icons-outlined">${isAi ? 'auto_awesome' : 'person'}</i>
        </div>
        <div class="msg-text"></div>
    `;

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();

    // Stream the content character by character
    const textDiv = messageDiv.querySelector('.msg-text');
    let currentText = '';
    let index = 0;

    return new Promise((resolve) => {
        const streamInterval = setInterval(() => {
            if (index < content.length) {
                // Add multiple characters at once for faster streaming
                const chunkSize = 3;
                const endIndex = Math.min(index + chunkSize, content.length);
                currentText += content.substring(index, endIndex);
                textDiv.innerHTML = marked.parse(currentText);
                index = endIndex;
                scrollToBottom();
            } else {
                clearInterval(streamInterval);
                messageDiv.id = ''; // Remove streaming id
                resolve(messageDiv);
            }
        }, 15); // 15ms per chunk for smooth animation
    });
}

// Show typing indicator
function showTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');

    // Remove empty state if present
    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        messagesContainer.innerHTML = '';
    }

    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai-message typing-indicator';
    typingDiv.innerHTML = `
        <div class="msg-avatar ai">
            <i class="material-icons-outlined">auto_awesome</i>
        </div>
        <div class="msg-text">
            <div class="typing-indicator">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        </div>
    `;
    messagesContainer.appendChild(typingDiv);
    scrollToBottom();
}

// Hide typing indicator
function hideTypingIndicator() {
    const typingIndicator = document.querySelector('.typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Show error message
function showError(message) {
    console.error('Error:', message);
    const messagesContainer = document.getElementById('chatMessages');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message ai-message';
    errorDiv.innerHTML = `
        <div class="msg-avatar ai">
            <i class="material-icons-outlined">error</i>
        </div>
        <div class="msg-text" style="color: #d32f2f;">
            <p>${escapeHtml(message)}</p>
        </div>
    `;
    messagesContainer.appendChild(errorDiv);
    scrollToBottom();
}

// Scroll chat to bottom
function scrollToBottom() {
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendBtn');

    if (!textarea || !sendButton) {
        console.error('Required elements not found');
        return;
    }

    // Initialize chat and load chat list
    initializeChat();
    loadChatList();

    // Send message on button click
    sendButton.addEventListener('click', sendMessage);

    // Send message on Enter (without Shift)
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}); 