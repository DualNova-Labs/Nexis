// Get API base URL - works for both local server and direct file access
const hostname = window.location.hostname || 'localhost';
const API_URL = `http://${hostname}:3001`;
const WS_URL = `ws://${hostname}:3001`;

// WebSocket for real-time collaboration
let ws = null;
let roomParticipants = new Set();

// Get DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filesGrid = document.getElementById('filesGrid');
const fileCount = document.getElementById('fileCount');
const roomModal = document.getElementById('roomModal');
const roomBanner = document.getElementById('roomBanner');
const currentRoomCodeEl = document.getElementById('currentRoomCode');
const roomCodeInput = document.getElementById('roomCodeInput');

// Get user token
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
const userDetails = JSON.parse(localStorage.getItem('userDetails') || sessionStorage.getItem('userDetails') || 'null');

// Check authentication
if (!token || !userDetails) {
    window.location.href = './login.html';
}

// Room code management
let currentRoomCode = localStorage.getItem('currentRoomCode');

// Show room modal on page load if no room code
if (!currentRoomCode) {
    setTimeout(() => showRoomModal(), 100);
} else {
    updateRoomUI();
    loadFiles();
    // Connect WebSocket for real-time collaboration
    connectWebSocket();
}

// Make functions globally accessible for onclick handlers
window.showRoomModal = function () {
    roomModal.classList.add('active');
    roomCodeInput.value = currentRoomCode || '';
    setTimeout(() => roomCodeInput.focus(), 100);
}

window.hideRoomModal = function () {
    if (!currentRoomCode) {
        alert('Please enter a room code to continue');
        return;
    }
    roomModal.classList.remove('active');
}

window.generateRoomCode = function () {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 3; i++) {
        if (i > 0) code += '-';
        for (let j = 0; j < 3; j++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }
    roomCodeInput.value = code;
}

window.joinRoom = function () {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
        alert('Please enter a room code');
        return;
    }

    // Join the room (Google Meet style - any code works, room created on first file upload)
    currentRoomCode = roomCode;
    localStorage.setItem('currentRoomCode', roomCode);

    window.hideRoomModal();
    updateRoomUI();
    loadFiles();

    // Connect WebSocket for real-time collaboration
    connectWebSocket();

    // Show feedback to user
    showNotification(`Joined room: ${roomCode}`, 'success');
}

function updateRoomUI() {
    currentRoomCodeEl.textContent = currentRoomCode;
    roomBanner.style.display = 'flex';
}

window.copyRoomCode = function () {
    navigator.clipboard.writeText(currentRoomCode).then(() => {
        // Simple feedback
        const btn = event.target.closest('.btn-copy');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="material-icons-outlined" style="font-size: 18px;">check</i> Copied!';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    }).catch(err => {
        alert('Failed to copy: ' + err);
    });
}

window.exitRoom = function () {
    if (!confirm('Are you sure you want to exit this room? You can rejoin later with the same code.')) {
        return;
    }

    // Disconnect WebSocket
    if (ws) {
        ws.close();
        ws = null;
    }

    // Clear room code
    currentRoomCode = null;
    localStorage.removeItem('currentRoomCode');

    // Redirect to dashboard
    window.location.href = './dashboard.html';
}

// WebSocket Functions for Real-Time Collaboration
function connectWebSocket() {
    if (ws) {
        ws.close();
    }

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket connected for file sharing');
        // Join the file room if we have a room code
        if (currentRoomCode) {
            joinFileRoom();
        }
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message.type);

            switch (message.type) {
                case 'file-uploaded':
                    // Another user uploaded a file - add it to the list
                    handleFileUploaded(message.file, message.uploadedBy);
                    break;
                case 'file-deleted':
                    // Another user deleted a file - remove it from the list
                    handleFileDeleted(message.fileId);
                    break;
                case 'file-user-joined':
                    // Another user joined the room
                    roomParticipants.add(message.email);
                    updateParticipantsDisplay();
                    showNotification(`${message.email.split('@')[0]} joined the room`, 'info');
                    break;
                case 'file-room-info':
                    // Received current participants
                    roomParticipants = new Set(message.participants);
                    updateParticipantsDisplay();
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Reconnect after 3 seconds
        setTimeout(() => {
            if (currentRoomCode) {
                connectWebSocket();
            }
        }, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function joinFileRoom() {
    if (ws && ws.readyState === WebSocket.OPEN && currentRoomCode) {
        ws.send(JSON.stringify({
            type: 'file-join',
            room: currentRoomCode,
            email: userDetails.email
        }));
        console.log(`Joined file room: ${currentRoomCode}`);
    }
}

function handleFileUploaded(file, uploadedBy) {
    // Show notification
    showNotification(`New file uploaded by ${uploadedBy.split('@')[0]}: ${file.filename}`, 'success');

    // Reload file list to show the new file
    loadFiles();
}

function handleFileDeleted(fileId) {
    // Remove the file card from the UI
    const fileCard = document.querySelector(`[data-file-id="${fileId}"]`);
    if (fileCard) {
        fileCard.remove();
        showNotification('A file was deleted', 'info');

        // Update file count
        const currentCount = filesGrid.querySelectorAll('.file-card:not(.uploading)').length;
        fileCount.textContent = `${currentCount} file${currentCount !== 1 ? 's' : ''}`;

        // If no files left, show empty state
        if (currentCount === 0) {
            filesGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="material-icons-outlined">folder_open</i>
                    </div>
                    <h3 class="empty-title">No files in this room yet</h3>
                    <p class="empty-subtitle">Upload your first file to get started</p>
                </div>
            `;
        }
    }
}

// Update participants display in room banner
function updateParticipantsDisplay() {
    const participantsDisplay = document.getElementById('participantsDisplay');
    const participantsAvatars = document.getElementById('participantsAvatars');
    const participantsCount = document.getElementById('participantsCount');

    if (!participantsDisplay || roomParticipants.size === 0) {
        if (participantsDisplay) participantsDisplay.style.display = 'none';
        return;
    }

    participantsDisplay.style.display = 'flex';

    // Create avatar elements (show max 3 avatars + count)
    const participants = Array.from(roomParticipants);
    const visibleParticipants = participants.slice(0, 3);

    participantsAvatars.innerHTML = visibleParticipants.map(email => {
        const initials = email.split('@')[0].substring(0, 2).toUpperCase();
        return `<div class="participant-avatar" title="${email}">${initials}</div>`;
    }).join('');

    // Update count text
    const remaining = participants.length - visibleParticipants.length;
    if (remaining > 0) {
        participantsCount.textContent = `+${remaining} more`;
    } else {
        participantsCount.textContent = `${participants.length} participant${participants.length !== 1 ? 's' : ''}`;
    }
}

// Close modal when clicking outside
roomModal.addEventListener('click', (e) => {
    if (e.target === roomModal && currentRoomCode) {
        window.hideRoomModal();
    }
});

// Allow Enter key to join room
roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        window.joinRoom();
    }
});

// Drag and drop handlers
let dragCounter = 0;

dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter === 0) {
        dropZone.classList.remove('dragging');
    }
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove('dragging');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleMultipleFiles(files);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleMultipleFiles(fileInput.files);
    }
});

// Handle multiple file uploads
async function handleMultipleFiles(files) {
    if (!currentRoomCode) {
        alert('Please join a room first');
        showRoomModal();
        return;
    }

    const fileArray = Array.from(files);

    for (const file of fileArray) {
        await uploadFile(file);
    }

    fileInput.value = ''; // Reset input
}

// Upload file
async function uploadFile(file) {
    try {
        // Ensure we have a valid room code
        if (!currentRoomCode || currentRoomCode.trim() === '') {
            throw new Error('No room code set. Please join a room first.');
        }

        const roomCode = currentRoomCode.trim().toUpperCase();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomCode', roomCode);

        console.log('Uploading file to room:', roomCode, 'File:', file.name);

        // Show uploading state
        const uploadingCard = showUploadingState(file.name);

        const response = await fetch(`${API_URL}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            console.log('File uploaded successfully:', data);
            // Remove uploading card
            uploadingCard.remove();
            // Refresh file list
            await loadFiles();
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Failed to upload file: ' + error.message, 'error');
        // Remove uploading card on error
        const uploadingCards = filesGrid.querySelectorAll('.file-card.uploading');
        uploadingCards.forEach(card => card.remove());
    }
}

// Show uploading state
function showUploadingState(filename) {
    const emptyState = filesGrid.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const uploadingCard = document.createElement('div');
    uploadingCard.className = 'file-card uploading loading';

    const fileType = getFileType(filename);

    uploadingCard.innerHTML = `
        <div class="file-icon ${fileType}">
            <i class="material-icons">cloud_upload</i>
        </div>
        <div class="file-info">
            <div class="file-name">${filename}</div>
            <div class="file-metadata">
                <span>Uploading...</span>
            </div>
        </div>
    `;

    filesGrid.insertBefore(uploadingCard, filesGrid.firstChild);
    return uploadingCard;
}

// Load files
async function loadFiles() {
    if (!currentRoomCode) {
        console.log('No room code set, skipping file load');
        return;
    }

    const roomCode = currentRoomCode.toUpperCase();
    console.log('Loading files for room:', roomCode);

    try {
        const response = await fetch(`${API_URL}/files/list?roomCode=${encodeURIComponent(roomCode)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        console.log('Files loaded:', data.files?.length || 0, 'files for room', roomCode);

        if (response.ok) {
            displayFiles(data.files);
        } else {
            throw new Error(data.error || 'Failed to load files');
        }
    } catch (error) {
        console.error('Load files error:', error);
        filesGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="material-icons-outlined">error_outline</i>
                </div>
                <h3 class="empty-title">Failed to load files</h3>
                <p class="empty-subtitle">Please refresh the page to try again</p>
            </div>
        `;
    }
}

// Display files
function displayFiles(files) {
    // Remove uploading cards
    const uploadingCards = filesGrid.querySelectorAll('.uploading');
    uploadingCards.forEach(card => card.remove());

    if (files.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="material-icons-outlined">folder_open</i>
                </div>
                <h3 class="empty-title">No files in this room yet</h3>
                <p class="empty-subtitle">Upload your first file to get started</p>
            </div>
        `;
        fileCount.textContent = '0 files';
        return;
    }

    fileCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;

    filesGrid.innerHTML = files.map(file => {
        const icon = getFileIcon(file.mimetype);
        const fileType = getFileTypeClass(file.mimetype);
        const size = formatFileSize(file.size);
        const date = formatDate(file.uploadedAt);
        const isOwner = file.uploadedBy === userDetails.email;

        return `
            <div class="file-card" data-file-id="${file.id}">
                <div class="file-icon ${fileType}">
                    <i class="material-icons">${icon}</i>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.filename}">${file.filename}</div>
                    <div class="file-metadata">
                        <span>
                            <i class="material-icons-outlined" style="font-size: 14px;">storage</i>
                            ${size}
                        </span>
                        <span class="metadata-separator"></span>
                        <span>
                            <i class="material-icons-outlined" style="font-size: 14px;">schedule</i>
                            ${date}
                        </span>
                        <span class="metadata-separator"></span>
                        <span>
                            <i class="material-icons-outlined" style="font-size: 14px;">person</i>
                            ${isOwner ? 'You' : file.uploadedBy.split('@')[0]}
                        </span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="action-btn" onclick="downloadFile('${file.id}', '${file.filename}')" title="Download">
                        <i class="material-icons-outlined">download</i>
                    </button>
                    ${isOwner ? `
                    <button class="action-btn delete" onclick="deleteFile('${file.id}')" title="Delete">
                        <i class="material-icons-outlined">delete</i>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Get file type for uploading state
function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'document';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet';
    if (['ppt', 'pptx'].includes(ext)) return 'presentation';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';

    return 'default';
}

// Get file icon based on mimetype
function getFileIcon(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'videocam';
    if (mimetype.startsWith('audio/')) return 'audiotrack';
    if (mimetype.includes('pdf')) return 'picture_as_pdf';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'description';
    if (mimetype.includes('sheet') || mimetype.includes('excel')) return 'table_chart';
    if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return 'slideshow';
    if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('compressed')) return 'folder_zip';
    return 'insert_drive_file';
}

// Get file type class for styling
function getFileTypeClass(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.includes('pdf')) return 'pdf';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
    if (mimetype.includes('sheet') || mimetype.includes('excel')) return 'spreadsheet';
    if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return 'presentation';
    if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('compressed')) return 'archive';
    return 'default';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

// Download file
window.downloadFile = async function (fileId, filename) {
    try {
        const response = await fetch(`${API_URL}/files/download/${fileId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showNotification('File downloaded successfully', 'success');
        } else {
            throw new Error('Download failed');
        }
    } catch (error) {
        console.error('Download error:', error);
        showNotification('Failed to download file', 'error');
    }
}

// Delete file
window.deleteFile = async function (fileId) {
    if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/files/delete/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('File deleted successfully', 'success');
            // Refresh file list
            await loadFiles();
        } else {
            throw new Error(data.error || 'Delete failed');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Failed to delete file: ' + error.message, 'error');
    }
}

// Simple notification function
function showNotification(message, type = 'info') {
    // You can implement a toast/snackbar here
    // For now, we'll use console
    console.log(`${type.toUpperCase()}: ${message}`);
}

