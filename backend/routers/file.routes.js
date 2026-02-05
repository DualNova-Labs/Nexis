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

        const { roomCode } = req.body;
        if (!roomCode) {
            return res.status(400).json({ error: 'Room code is required' });
        }

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
        if (!roomCode) {
            return res.status(400).json({ error: 'Room code is required' });
        }

        const files = await File.find({ roomCode: roomCode }).sort({ uploadedAt: -1 });
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

module.exports = router;
