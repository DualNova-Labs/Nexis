const WebSocket = require('ws');

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    
    // Store active connections and their rooms
    const rooms = new Map();
    const clients = new Map();
    
    // Heartbeat interval (30 seconds)
    const HEARTBEAT_INTERVAL = 30000;
    const CLIENT_TIMEOUT = 35000;
    
    function heartbeat() {
        this.isAlive = true;
    }
    
    // Check for stale connections
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                handleDisconnect(ws);
                return ws.terminate();
            }
            
            ws.isAlive = false;
            ws.ping();
        });
    }, HEARTBEAT_INTERVAL);
    
    wss.on('close', () => {
        clearInterval(interval);
    });
    
    wss.on('connection', (ws) => {
        console.log('New WebSocket connection established');
        
        // Setup heartbeat
        ws.isAlive = true;
        ws.on('pong', heartbeat);
        
        // Setup error recovery
        let reconnectAttempts = 0;
        const MAX_RECONNECT_ATTEMPTS = 5;
        
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                console.log('Received WebSocket message:', message.type, 'for room:', message.room);
                
                // Reset reconnect attempts on successful message
                reconnectAttempts = 0;
                
                switch (message.type) {
                    case 'join':
                        await handleJoin(ws, message);
                        break;
                    case 'file-join':
                        await handleFileJoin(ws, message);
                        break;
                    case 'file-upload':
                        await handleFileUpload(ws, message);
                        break;
                    case 'file-delete':
                        await handleFileDelete(ws, message);
                        break;
                    case 'offer':
                        await handleOffer(ws, message);
                        break;
                    case 'answer':
                        await handleAnswer(ws, message);
                        break;
                    case 'ice-candidate':
                        await handleIceCandidate(ws, message);
                        break;
                    case 'leave':
                        await handleLeave(ws, message);
                        break;
                    case 'chat':
                        await handleChat(ws, message);
                        break;
                }
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                handleError(ws, error);
            }
        });
        
        ws.on('close', () => {
            handleDisconnect(ws);
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            handleError(ws, error);
        });
    });
    
    // Enhanced error handling
    async function handleError(ws, error) {
        const clientInfo = clients.get(ws);
        if (clientInfo) {
            reconnectAttempts++;
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                // Notify client of error and reconnection attempt
                try {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Connection error, attempting to reconnect...',
                        attempt: reconnectAttempts
                    }));
                } catch (e) {
                    console.error('Error sending error message:', e);
                }
            } else {
                handleDisconnect(ws);
            }
        }
    }
    
    // Enhanced room handling with capacity limits
    async function handleJoin(ws, message) {
        const { room, email } = message;
        const MAX_ROOM_CAPACITY = 10;
        
        // Check room capacity
        if (rooms.has(room) && rooms.get(room).size >= MAX_ROOM_CAPACITY) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Room is full'
            }));
            return;
        }
        
        // Store client info
        clients.set(ws, { room, email });
        
        // Add to room
        if (!rooms.has(room)) {
            rooms.set(room, new Set());
        }
        rooms.get(room).add(ws);
        
        // Notify others in room
        broadcastToRoom(room, {
            type: 'user-joined',
            email: email
        }, ws);
        
        // Send current participants to the new user
        const participants = Array.from(rooms.get(room))
            .filter(client => client !== ws)
            .map(client => clients.get(client).email);
            
        ws.send(JSON.stringify({
            type: 'room-info',
            participants: participants
        }));
    }
    
    // Handle WebRTC offer
    async function handleOffer(ws, message) {
        const { room, offer } = message;
        console.log(`Broadcasting offer to room ${room}`);
        await broadcastToRoom(room, {
            type: 'offer',
            offer: offer
        }, ws);
    }
    
    // Handle WebRTC answer
    async function handleAnswer(ws, message) {
        const { room, answer } = message;
        console.log(`Broadcasting answer to room ${room}`);
        await broadcastToRoom(room, {
            type: 'answer',
            answer: answer
        }, ws);
    }
    
    // Handle ICE candidate
    async function handleIceCandidate(ws, message) {
        const { room, candidate } = message;
        console.log(`Broadcasting ICE candidate to room ${room}`);
        await broadcastToRoom(room, {
            type: 'ice-candidate',
            candidate: candidate
        }, ws);
    }
    
    // Handle user leaving
    async function handleLeave(ws, message) {
        const { room, email } = message;
        console.log(`User ${email} leaving room ${room}`);
        await handleDisconnect(ws);
    }
    
    // File sharing handlers - like video call but for files
    async function handleFileJoin(ws, message) {
        const { room, email } = message;
        
        // Store client info for file room
        clients.set(ws, { room, email, type: 'file' });
        
        // Add to file room
        if (!rooms.has(room)) {
            rooms.set(room, new Set());
        }
        rooms.get(room).add(ws);
        
        console.log(`User ${email} joined file room ${room}`);
        
        // Notify others in room
        broadcastToRoom(room, {
            type: 'file-user-joined',
            email: email,
            timestamp: new Date().toISOString()
        }, ws);
        
        // Send current participants
        const participants = Array.from(rooms.get(room))
            .filter(client => client !== ws)
            .map(client => clients.get(client).email);
            
        ws.send(JSON.stringify({
            type: 'file-room-info',
            participants: participants
        }));
    }
    
    async function handleFileUpload(ws, message) {
        const clientInfo = clients.get(ws);
        if (!clientInfo) return;
        
        const { room } = clientInfo;
        const { file } = message;
        
        console.log(`File uploaded in room ${room} by ${clientInfo.email}:`, file.filename);
        
        // Broadcast to all users in the room
        broadcastToRoom(room, {
            type: 'file-uploaded',
            file: file,
            uploadedBy: clientInfo.email,
            timestamp: new Date().toISOString()
        }, ws);
    }
    
    async function handleFileDelete(ws, message) {
        const clientInfo = clients.get(ws);
        if (!clientInfo) return;
        
        const { room } = clientInfo;
        const { fileId } = message;
        
        console.log(`File deleted in room ${room} by ${clientInfo.email}:`, fileId);
        
        // Broadcast to all users in the room
        broadcastToRoom(room, {
            type: 'file-deleted',
            fileId: fileId,
            deletedBy: clientInfo.email,
            timestamp: new Date().toISOString()
        }, ws);
    }
    
    // Handle client disconnect
    function handleDisconnect(ws) {
        const clientInfo = clients.get(ws);
        if (clientInfo) {
            const { room, email } = clientInfo;
            
            // Remove from room
            if (rooms.has(room)) {
                rooms.get(room).delete(ws);
                if (rooms.get(room).size === 0) {
                    rooms.delete(room);
                }
            }
            
            // Notify others
            broadcastToRoom(room, {
                type: 'user-left',
                email: email
            }, ws);
            
            // Clean up
            clients.delete(ws);
            console.log(`User ${email} disconnected from room ${room}`);
        }
    }
    
    // Enhanced broadcast with retry mechanism
    async function broadcastToRoom(room, message, sender) {
        if (rooms.has(room)) {
            const broadcasts = Array.from(rooms.get(room)).map(async client => {
                if (client !== sender && client.readyState === WebSocket.OPEN) {
                    try {
                        await new Promise((resolve, reject) => {
                            client.send(JSON.stringify(message), (error) => {
                                if (error) reject(error);
                                else resolve();
                            });
                        });
                    } catch (error) {
                        console.error('Error broadcasting message:', error);
                        handleError(client, error);
                    }
                }
            });
            
            await Promise.all(broadcasts);
        }
    }
    
    // Return the broadcast function for use in HTTP routes
    return broadcastToRoom;
}

module.exports = { setupWebSocket };