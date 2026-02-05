let chatId = null;
let isProcessing = false;

// Add API base URL and configuration
const API_URL = `http://${window.location.hostname}:3001`;
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
            loadChatHistory();
        } else {
            throw new Error(data.error || 'Failed to initialize chat');
        }
    } catch (error) {
        console.error('Error initializing chat:', error);
        showError(`Failed to initialize chat: ${error.message}`);
    }
}

// Load chat history
async function loadChatHistory() {
    if (!chatId) return;

    try {
        const response = await fetch(`${API_URL}/api/ai/chat/history/${chatId}`);
        const data = await response.json();
        
        if (data.ok) {
            const messagesContainer = document.querySelector('.chat-messages');
            messagesContainer.innerHTML = ''; // Clear existing messages
            
            data.history.forEach(message => {
                appendMessage(message.content, message.role === 'assistant');
            });
            
            scrollToBottom();
        }
    } catch (error) {
        console.error('Error loading history:', error);
        showError('Failed to load chat history.');
    }
}

// Send message
async function sendMessage() {
    if (isProcessing) return;

    const textarea = document.querySelector('.chat-input');
    const message = textarea.value.trim();
    
    if (!message) return;
    
    try {
        isProcessing = true;
        textarea.value = '';
        updateTextareaHeight(textarea);
        
        // Show user message immediately
        appendMessage(message, false);
        scrollToBottom();
        
        // Show typing indicator
        showTypingIndicator();
        
        const response = await fetch(`${API_URL}/api/ai/chat/message`, {
            method: 'POST',
            ...API_CONFIG,
            body: JSON.stringify({ message, chatId })
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        hideTypingIndicator();
        
        if (data.ok) {
            appendMessage(data.response, true);
            scrollToBottom();
        } else {
            showError('Failed to get response. Please try again.');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        hideTypingIndicator();
        showError('Failed to send message. Please try again.');
    } finally {
        isProcessing = false;
    }
}

// Format timestamp
function formatTimestamp(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date);
    
    const timeString = messageDate.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit'
    });
    
    if (messageDate >= today) {
        return timeString;
    } else if (messageDate >= new Date(today - 86400000)) {
        return `Yesterday ${timeString}`;
    } else {
        return messageDate.toLocaleDateString([], {
            month: 'short',
            day: 'numeric'
        }) + ' ' + timeString;
    }
}

// Format message content (handle markdown-like syntax)
function formatMessage(content) {
    if (!content) return '';
    
    // Convert URLs to links
    content = content.replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    // Convert code blocks with language support
    content = content.replace(/```(\w+)?\n([\s\S]+?)```/g, (_, lang, code) => {
        return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });
    
    // Convert inline code
    content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert bullet points
    content = content.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    content = content.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Convert line breaks
    content = content.replace(/\n/g, '<br>');
    
    return content;
}

// Append message with typing animation
async function appendMessage(content, isAi, timestamp = new Date()) {
    const messagesContainer = document.querySelector('.chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isAi ? 'ai' : ''}`;
    
    messageDiv.innerHTML = `
        <div class="message-avatar ${isAi ? 'ai-avatar' : 'user-avatar'}">
            <i class="fas fa-${isAi ? 'robot' : 'user'}"></i>
        </div>
        <div class="message-content">
            ${isAi ? '<span class="typing-text"></span>' : formatMessage(content)}
            <div class="message-timestamp">${formatTimestamp(timestamp)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();

    if (isAi) {
        const typingText = messageDiv.querySelector('.typing-text');
        const formattedContent = formatMessage(content);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formattedContent;
        const textContent = tempDiv.textContent;
        
        // Type each character with a random delay
        for (let i = 0; i < textContent.length; i++) {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 20));
            typingText.textContent = textContent.slice(0, i + 1);
            scrollToBottom();
        }

        // After typing is complete, replace with formatted content
        typingText.innerHTML = formattedContent;
    }
}

// Show typing indicator
function showTypingIndicator() {
    const messagesContainer = document.querySelector('.chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai typing-indicator';
    typingDiv.innerHTML = `
        <div class="message-avatar ai-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
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
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Scroll chat to bottom
function scrollToBottom() {
    const messagesContainer = document.querySelector('.chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Update textarea height
function updateTextareaHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.querySelector('.chat-input');
    const sendButton = document.querySelector('.send-btn');
    const newChatButton = document.querySelector('.new-chat-btn');
    
    // Initialize chat
    initializeChat();
    
    // Send message on button click
    sendButton.addEventListener('click', sendMessage);
    
    // Send message on Enter (Shift+Enter for new line)
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Auto-resize textarea
    textarea.addEventListener('input', () => {
        updateTextareaHeight(textarea);
    });
    
    // Start new chat
    newChatButton.addEventListener('click', () => {
        chatId = null;
        initializeChat();
    });
    
    // Handle chat history items
    document.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.history-item').forEach(i => {
                i.classList.remove('active');
            });
            item.classList.add('active');
        });
    });
}); 