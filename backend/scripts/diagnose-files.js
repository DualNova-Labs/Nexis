const mongoose = require('mongoose');
const File = require('../models/File');
require('dotenv').config();

async function diagnoseFiles() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nexis', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB\n');

        // Get all files
        const allFiles = await File.find({});
        console.log(`Total files in database: ${allFiles.length}\n`);

        // Group by room code
        const byRoom = {};
        const noRoomCode = [];

        allFiles.forEach(file => {
            const room = file.roomCode;
            if (!room || room === '' || room === 'undefined' || room === 'null') {
                noRoomCode.push(file);
            } else {
                if (!byRoom[room]) {
                    byRoom[room] = [];
                }
                byRoom[room].push(file);
            }
        });

        // Display files without proper room codes
        if (noRoomCode.length > 0) {
            console.log(`❌ FILES WITHOUT VALID ROOM CODE: ${noRoomCode.length}`);
            noRoomCode.forEach(file => {
                console.log(`   - ${file.originalName} (roomCode: "${file.roomCode}")`);
            });
            console.log('');
        }

        // Display files by room
        console.log(`FILES BY ROOM CODE:`);
        Object.keys(byRoom).forEach(room => {
            console.log(`\n📁 Room: ${room} (${byRoom[room].length} files)`);
            byRoom[room].forEach(file => {
                console.log(`   - ${file.originalName}`);
            });
        });

        if (Object.keys(byRoom).length === 0 && noRoomCode.length > 0) {
            console.log('\n⚠️  WARNING: All files have invalid room codes!');
            console.log('This explains why the same files appear in all rooms.');
            console.log('\nRECOMMENDATION: Delete these invalid files and re-upload them with proper room codes.');
        }

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

diagnoseFiles();
