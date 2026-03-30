# Project Analysis: Nexis - Digital Collaboration Platform

Nexis is a comprehensive digital collaboration workspace featuring real-time video conferencing, AI-powered assistance, collaborative drawing, and secure file sharing.

## 🏗️ Technical Architecture

The project follows a standard Client-Server architecture with a real-time signaling layer:

### Backend (Node.js & Express)
- **Primary Server**: Express.js handles RESTful API endpoints for authentication, user management, and file metadata.
- **Real-time Layer**: A WebSocket implementation (`ws` library) serves as the "signaling server" for WebRTC and handles all live synchronization (chat, whiteboard, room updates).
- **Database**: MongoDB (via Mongoose) stores user data, chat history, and file records.
- **AI Integration**: Direct integration with Google's Gemini API (`@google/generative-ai`) for smart assistance.
- **Security**: 
    - JWT (JSON Web Tokens) for stateless authentication.
    - Bcrypt for secure password hashing.
    - Passport.js for Google OAuth integration.
    - Multer for handling file uploads.

### Frontend (Vanilla JS, HTML5, CSS3)
- **UI Design**: A modern, premium aesthetic inspired by Google Meet, utilizing the "Outfit" font and Material Design Icons.
- **Navigation**: Multi-page application (MPA) structure where each feature resides in its own HTML file.
- **Real-time Communication**: Native `WebSocket` API for connection to the backend.
- **WebRTC**: Peer-to-Peer video and audio streaming with STUN/TURN server support for NAT traversal.
- **Canvas API**: Powering the interactive whiteboard with real-time drawing synchronization.

---

## 🚀 Key Feature Deep-Dive

### 1. Video Conferencing (WebRTC)
- **P2P Streaming**: Connects users directly for low-latency HD video.
- **Signaling Flow**: Uses the custom WebSocket implementation to exchange SDP (Offer/Answer) and ICE candidates.
- **Media Controls**: Includes toggles for camera/microphone and a unique "Test Mode" that generates a synthetic video stream for debugging.
- **Bandwidth Optimization**: Implements SDP modification to enforce bitrate limits based on user-selected quality presets (High, Medium, Low).

### 2. Collaborative Whiteboard
- **Synchronous Drawing**: Every stroke (pen, line, rectangle, circle) is broadcasted as a JSON packet via WebSockets.
- **State Management**: When a new user joins, the existing users capture their canvas as a `dataURL` and send it to the joiner to ensure full state parity.

### 3. AI Assistant (Gemini)
- **Contextual Help**: Provides a chat interface where users can interact with the Gemini AI.
- **Backend Proxy**: The frontend communicates with a dedicated `/api/ai` endpoint to keep API keys secure on the server.

### 4. File Sharing
- **Room-based Sharing**: Users can upload files to a specific room.
- **Real-time Alerts**: When a file is uploaded, all users in the room receive a WebSocket notification to refresh their file list.

---

## 📁 Repository Structure

```text
Nexis/
├── backend/               # Node.js Server
│   ├── config/           # DB & Passport config
│   ├── models/           # Mongoose schemas (User, Message, File)
│   ├── routers/          # API Route definitions
│   ├── middleware/       # Auth & Error handling
│   ├── features/         # Logic for AI (Gemini)
│   ├── index.js          # Main entry point
│   └── websocket.js      # Real-time signaling logic
├── frontend/              # Web Client
│   ├── Scripts/          # Logic per feature (video.js, whiteboard.js, etc.)
│   ├── Style(s)/         # CSS styling
│   ├── Images/           # Static assets
│   └── *.html            # Individual feature pages
└── start.bat              # One-click startup script (Windows)
```

---

## 🛠️ Tech Stack Summary

| Layer | Technology |
| :--- | :--- |
| **Language** | JavaScript (Node.js / Client-side) |
| **Web Framework** | Express.js / Vanilla HTML & CSS |
| **Database** | MongoDB |
| **Real-time** | WebSockets (`ws`) |
| **Streaming** | WebRTC |
| **AI** | Google Gemini Generative AI |
| **Auth** | JWT / Passport.js (Google OAuth) |
| **Styling** | Vanilla CSS (Material-inspired) |

---

## 📈 Observations & Recommendations

- **Performance**: The use of Vanilla JS keeps the frontend lightweight. However, as the number of pages grows, common logic (like authentication checks) is repeated across multiple scripts.
- **Scalability**: The current WebSocket implementation stores room states in-memory (`Map`). For larger deployments, a Redis-based adapter would be needed to scale across multiple server instances.
- **User Experience**: The "Test Camera" feature is a standout implementation that significantly improves ease of use for users with hardware issues.
