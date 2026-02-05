const mongoose = require('mongoose');
const fs = require('fs');
const File = require('../models/File');
require('dotenv').config();

async function cleanupInvalidFiles() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nexis', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB\n');

        // Find files with invalid room codes
        const invalidFiles = await File.find({
            $or: [
                { roomCode: null },
                { roomCode: '' },
                { roomCode: 'undefined' },
                { roomCode: 'null' },
                { roomCode: { $exists: false } }
            ]
        });

        console.log(`Found ${invalidFiles.length} files with invalid room codes\n`);

        if (invalidFiles.length === 0) {
            console.log('✅ No invalid files found. Database is clean!');
            await mongoose.connection.close();
            return;
        }

        console.log('Files to be deleted:');
        invalidFiles.forEach(file => {
            console.log(`  - ${file.originalName} (roomCode: "${file.roomCode}")`);
        });

        console.log('\n🗑️  Deleting files...\n');

        let deletedCount = 0;
        let filesystemDeletedCount = 0;

        for (const file of invalidFiles) {
            try {
                // Delete from filesystem if exists
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                    filesystemDeletedCount++;
                    console.log(`  ✓ Deleted file from disk: ${file.originalName}`);
                }

                // Delete from database
                await File.findByIdAndDelete(file._id);
                deletedCount++;
                console.log(`  ✓ Deleted from database: ${file.originalName}`);
            } catch (err) {
                console.error(`  ✗ Error deleting ${file.originalName}:`, err.message);
            }
        }

        console.log(`\n✅ Cleanup complete!`);
        console.log(`   - Deleted ${deletedCount} files from database`);
        console.log(`   - Deleted ${filesystemDeletedCount} files from disk`);
        console.log('\n💡 Users can now upload files with proper room codes.');

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

cleanupInvalidFiles();
