const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    mimetype: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    path: {
        type: String,
        required: true
    },
    uploadedBy: {
        type: String,
        required: true
    },
    roomCode: {
        type: String,
        required: true,
        index: true  // Add index for faster queries
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('File', fileSchema);
