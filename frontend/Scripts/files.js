const API_URL = `http://${window.location.hostname}:3001`;

// Get DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filesGrid = document.getElementById('filesGrid');
const filesCount = document.querySelector('.files-count');

// Get user token
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
const userDetails = JSON.parse(localStorage.getItem('userDetails') || sessionStorage.getItem('userDetails') || 'null');

// Check authentication
if (!token || !userDetails) {
    window.location.href = './login.html';
}

// Drag and drop handlers
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary)';
    dropZone.style.background = '#f8f9ff';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border)';
    dropZone.style.background = 'var(--surface)';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    dropZone.style.background = 'var(--surface)';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        uploadFile(files[0]);
    }
});

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        uploadFile(fileInput.files[0]);
    }
});

// Upload file
async function uploadFile(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);

        // Show uploading state
        showUploadingState(file.name);

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
            // Refresh file list
            await loadFiles();
            fileInput.value = ''; // Reset input
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Failed to upload file: ' + error.message);
    }
}

// Show uploading state
function showUploadingState(filename) {
    const emptyState = filesGrid.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const uploadingCard = document.createElement('div');
    uploadingCard.className = 'file-card uploading';
    uploadingCard.innerHTML = `
        <div class="file-icon-wrapper">
            <i class="material-icons-outlined">cloud_upload</i>
        </div>
        <div class="file-details">
            <p class="file-name">${filename}</p>
            <p class="file-meta">Uploading...</p>
        </div>
    `;
    filesGrid.insertBefore(uploadingCard, filesGrid.firstChild);
}

// Load files
async function loadFiles() {
    try {
        const response = await fetch(`${API_URL}/files/list`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            displayFiles(data.files);
        } else {
            throw new Error(data.error || 'Failed to load files');
        }
    } catch (error) {
        console.error('Load files error:', error);
        filesGrid.innerHTML = `
            <div class="empty-state">
                <i class="material-icons-outlined" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;">error_outline</i>
                <p>Failed to load files. Please try again.</p>
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
                <i class="material-icons-outlined" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;">folder_open</i>
                <p>No files uploaded yet. Drag some here to get started.</p>
            </div>
        `;
        filesCount.textContent = '0 files';
        return;
    }

    filesCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    
    filesGrid.innerHTML = files.map(file => {
        const icon = getFileIcon(file.mimetype);
        const size = formatFileSize(file.size);
        const date = formatDate(file.uploadedAt);
        
        return `
            <div class="file-card" data-file-id="${file.id}">
                <div class="file-icon-wrapper">
                    <i class="material-icons-outlined">${icon}</i>
                </div>
                <div class="file-details">
                    <p class="file-name" title="${file.filename}">${file.filename}</p>
                    <p class="file-meta">${size} • ${date} • ${file.uploadedBy}</p>
                </div>
                <div class="file-actions">
                    <button class="action-btn" onclick="downloadFile('${file.id}', '${file.filename}')" title="Download">
                        <i class="material-icons-outlined">download</i>
                    </button>
                    <button class="action-btn" onclick="deleteFile('${file.id}')" title="Delete">
                        <i class="material-icons-outlined">delete</i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
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
    return date.toLocaleDateString();
}

// Download file
async function downloadFile(fileId, filename) {
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
        } else {
            throw new Error('Download failed');
        }
    } catch (error) {
        console.error('Download error:', error);
        alert('Failed to download file');
    }
}

// Delete file
async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) {
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
            // Refresh file list
            await loadFiles();
        } else {
            throw new Error(data.error || 'Delete failed');
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete file: ' + error.message);
    }
}

// Load files on page load
loadFiles();
