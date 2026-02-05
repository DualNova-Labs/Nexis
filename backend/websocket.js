const WebSocket = require('ws');

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    
    // Store active connections and their rooms
    const rooms = new Map();
    const clients = new Map();
    
    // Store whiteboard canvas state per room
    const whiteboardStates = new Map();
    
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
                    case 'whiteboard-join':
                        await handleWhiteboardJoin(ws, message);
                        break;
                    case 'whiteboard-draw':
                        await handleWhiteboardDraw(ws, message);
                        break;
                    case 'whiteboard-state':
                        await handleWhiteboardState(ws, message);
                        break;
                    case 'whiteboard-clear':
                        await handleWhiteboardClear(ws, message);
                        break;
                    case 'whiteboard-request-state':
                        await handleWhiteboardRequestState(ws, message);
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
    
    // Handle whiteboard join - send current canvas state to new user
    async function handleWhiteboardJoin(ws, message) {
        const { room } = message;
        console.log(`User joining whiteboard room ${room}`);
        
        // Store client info for whiteboard
        clients.set(ws, { room, email: message.email || 'anonymous' });
        
        // Add to room
        if (!rooms.has(room)) {
            rooms.set(room, new Set());
        }
        rooms.get(room).add(ws);
        
        // Send existing canvas state if available
        if (whiteboardStates.has(room)) {
            const state = whiteboardStates.get(room);
            ws.send(JSON.stringify({
                type: 'whiteboard-state',
                state: state
            }));
            console.log(`Sent existing whiteboard state to new user in room ${room}`);
        }
        
        // Notify others
        broadcastToRoom(room, {
            type: 'user-joined',
            email: message.email || 'anonymous'
        }, ws);
    }
    
    // Handle whiteboard draw - broadcast drawing action to all users in room
    async function handleWhiteboardDraw(ws, message) {
        const { room, drawData } = message;
        
        // Broadcast draw action to all other users in the room
        await broadcastToRoom(room, {
            type: 'whiteboard-draw',
            drawData: drawData
        }, ws);
    }
    
    // Handle whiteboard state update - store and broadcast full canvas state
    async function handleWhiteboardState(ws, message) {
        const { room, state } = message;
        
        // Store the canvas state for this room
        whiteboardStates.set(room, state);
        console.log(`Updated whiteboard state for room ${room}`);
        
        // Broadcast to others (optional - for full sync)
        await broadcastToRoom(room, {
            type: 'whiteboard-state',
            state: state
        }, ws);
    }
    
    // Handle whiteboard clear - clear canvas for all users
    async function handleWhiteboardClear(ws, message) {
        const { room } = message;
        
        // Clear stored state
        whiteboardStates.delete(room);
        console.log(`Cleared whiteboard state for room ${room}`);
        
        // Broadcast clear to all users
        await broadcastToRoom(room, {
            type: 'whiteboard-clear'
        }, ws);
    }
    
    // Handle request for current whiteboard state
    async function handleWhiteboardRequestState(ws, message) {
        const { room } = message;
        
        // If we have stored state, send it
        if (whiteboardStates.has(room)) {
            ws.send(JSON.stringify({
                type: 'whiteboard-state',
                state: whiteboardStates.get(room)
            }));
        } else {
            // Request state from another user in the room
            const roomClients = rooms.get(room);
            if (roomClients && roomClients.size > 1) {
                for (const client of roomClients) {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'whiteboard-request-state',
                            requesterId: Date.now()
                        }));
                        break;
                    }
                }
            }
        }
    }
}

module.exports = { setupWebSocket };