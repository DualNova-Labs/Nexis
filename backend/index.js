const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
require("dotenv").config();

const app = express();

// Import routes
const userRouter = require("./routers/user.routes");
const authRouter = require("./routers/auth.routes");
const messageRouter = require("./routers/message.routes");
const fileRouter = require("./routers/file.routes");
const { setupWebSocket } = require("./websocket");
const aiRouter = require('./routers/ai.routes');

// Create HTTP server
const server = http.createServer(app);

// CORS configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080', 'http://127.0.0.1:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Middleware
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.get("/", (req, res) => {
    res.json({ message: "Welcome to Nexis API", status: "running" });
});

// API routes
app.use("/user", userRouter);
app.use("/auth", authRouter);
app.use("/messages", messageRouter);
app.use("/files", fileRouter);
app.use('/api/ai', aiRouter);

// Setup WebSocket
setupWebSocket(server);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
    });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}`);
});