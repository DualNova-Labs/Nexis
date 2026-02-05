const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow all file types
        cb(null, true);
    }
});

// Upload file
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const roomCode = req.body.roomCode?.trim().toUpperCase();

        // Validate room code
        if (!roomCode || roomCode === '' || roomCode === 'UNDEFINED' || roomCode === 'NULL') {
            return res.status(400).json({ error: 'Valid room code is required' });
        }

        console.log('Uploading file to room:', roomCode, 'File:', req.file.originalname);

        const fileDoc = new File({
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            path: req.file.path,
            uploadedBy: req.user.email,
            roomCode: roomCode
        });

        await fileDoc.save();
        console.log('File saved to room:', roomCode);

        // Broadcast to all users in the room via WebSocket
        const broadcastToRoom = req.app.get('broadcastToRoom');
        if (broadcastToRoom) {
            broadcastToRoom(roomCode, {
                type: 'file-uploaded',
                file: {
                    id: fileDoc._id,
                    filename: fileDoc.originalName,
                    size: fileDoc.size,
                    mimetype: fileDoc.mimetype,
                    uploadedBy: fileDoc.uploadedBy,
                    uploadedAt: fileDoc.uploadedAt
                },
                uploadedBy: req.user.email
            }, null);
        }

        res.json({
            message: 'File uploaded successfully',
            file: {
                id: fileDoc._id,
                filename: fileDoc.originalName,
                size: fileDoc.size,
                mimetype: fileDoc.mimetype,
                uploadedAt: fileDoc.uploadedAt,
                roomCode: fileDoc.roomCode
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// Get all files for a specific room code
router.get('/list', authenticate, async (req, res) => {
    try {
        const { roomCode } = req.query;
        console.log('Files list requested for room:', roomCode);

        if (!roomCode || roomCode.trim() === '') {
            console.log('No room code provided, returning empty list');
            return res.json({ files: [] });
        }

        const trimmedRoomCode = roomCode.trim().toUpperCase();
        console.log('Searching for files in room:', trimmedRoomCode);

        // Query for files in this specific room, excluding any with invalid room codes
        const files = await File.find({
            roomCode: trimmedRoomCode,
            // Extra safety: exclude invalid room codes
            $and: [
                { roomCode: { $ne: null } },
                { roomCode: { $ne: '' } },
                { roomCode: { $ne: 'undefined' } },
                { roomCode: { $ne: 'null' } }
            ]
        }).sort({ uploadedAt: -1 });
        console.log(`Found ${files.length} files for room ${trimmedRoomCode}`);

        // Debug: Log each file's room code to verify they match
        files.forEach(file => {
            console.log(`  - File: ${file.originalName}, RoomCode: "${file.roomCode}", Match: ${file.roomCode === trimmedRoomCode}`);
        });

        res.json({
            files: files.map(file => ({
                id: file._id,
                filename: file.originalName,
                size: file.size,
                mimetype: file.mimetype,
                uploadedBy: file.uploadedBy,
                uploadedAt: file.uploadedAt,
                roomCode: file.roomCode
            }))
        });
    } catch (error) {
        console.error('List files error:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

// Download file
router.get('/download/:id', authenticate, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (!fs.existsSync(file.path)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(file.path, file.originalName);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Delete file
router.delete('/delete/:id', authenticate, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Only allow file owner to delete
        if (file.uploadedBy !== req.user.email) {
            return res.status(403).json({ error: 'Not authorized to delete this file' });
        }

        // Delete file from filesystem
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        // Delete from database
        await File.findByIdAndDelete(req.params.id);

        // Broadcast to all users in the room via WebSocket
        const broadcastToRoom = req.app.get('broadcastToRoom');
        if (broadcastToRoom) {
            broadcastToRoom(file.roomCode, {
                type: 'file-deleted',
                fileId: req.params.id,
                deletedBy: req.user.email
            }, null);
        }

        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});


// Verify room code
router.post('/verify-room', authenticate, async (req, res) => {
    try {
        console.log('Verify room request received:', req.body);
        const { roomCode } = req.body;

        if (!roomCode) {
            console.log('Room code missing in request');
            return res.status(400).json({ error: 'Room code is required' });
        }

        console.log(`Checking if room "${roomCode}" exists...`);

        // Check if room exists (has at least one file)
        const fileCount = await File.countDocuments({ roomCode: roomCode });

        console.log(`Room "${roomCode}" has ${fileCount} files`);

        res.json({
            exists: fileCount > 0,
            fileCount: fileCount,
            roomCode: roomCode
        });
    } catch (error) {
        console.error('Verify room error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: 'Failed to verify room',
            message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
        });
    }
});

// Diagnostic: Get all files grouped by room code (for debugging)
router.get('/debug/by-room', authenticate, async (req, res) => {
    try {
        const files = await File.find({}).select('originalName roomCode uploadedBy uploadedAt');
        const grouped = {};

        files.forEach(file => {
            const room = file.roomCode || 'NO_ROOM';
            if (!grouped[room]) {
                grouped[room] = [];
            }
            grouped[room].push({
                name: file.originalName,
                uploadedBy: file.uploadedBy,
                date: file.uploadedAt
            });
        });

        res.json({
            totalFiles: files.length,
            rooms: Object.keys(grouped),
            filesByRoom: grouped
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cleanup: Delete files without proper room codes
router.delete('/cleanup/invalid-rooms', authenticate, async (req, res) => {
    try {
        // Find files with null, empty, or undefined room codes
        const invalidFiles = await File.find({
            $or: [
                { roomCode: null },
                { roomCode: '' },
                { roomCode: { $exists: false } }
            ]
        });

        console.log(`Found ${invalidFiles.length} files with invalid room codes`);

        // Delete these files
        for (const file of invalidFiles) {
            // Delete from filesystem
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
            // Delete from database
            await File.findByIdAndDelete(file._id);
        }

        res.json({
            message: `Cleaned up ${invalidFiles.length} files with invalid room codes`,
            deletedFiles: invalidFiles.map(f => f.originalName)
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
