# 🚀 Nexis - Premium Digital Collaboration Platform

![Nexis Banner](frontend/Images/video-camera.png)

## 🌟 Overview

Nexis is the ultimate nexus for digital collaboration. Experience seamless HD video conferencing, AI-powered meeting insights, and lightning-fast messaging in one unified workspace. Built with modern web technologies, it offers a secure and intuitive environment for remote communication and collaboration.

## ✨ Features

### 📹 Video Conferencing
- High-quality video calls with multiple participants
- Audio controls and camera settings
- Room-based system for easy meeting organization
- Secure peer-to-peer connections

### 🖥️ Screen Sharing
- Real-time screen sharing capabilities
- Option to share specific windows or entire screen
- Perfect for presentations and remote collaboration
- Minimal latency for smooth viewing experience

### 💬 Chat Rooms
- Instant messaging with real-time updates
- Support for text, emojis, and file sharing
- Persistent chat history
- End-to-end encrypted messages

### 🤖 AI Assistant
- Built-in AI-powered helper
- Quick answers to common questions
- Smart suggestions and assistance
- Integrated with Gemini API for enhanced capabilities

### 📁 File Sharing
- Secure file upload and sharing
- Support for various file formats
- Easy file management and organization
- Direct file sharing within chat rooms

### 🎨 Interactive Whiteboard
- Real-time collaborative drawing tools
- Multiple drawing instruments and colors
- Perfect for brainstorming and teaching
- Save and share whiteboard sessions

## 🛠️ Technical Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Node.js
- **Database**: MongoDB
- **Real-time Communication**: WebSocket
- **Security**: JWT authentication, encrypted connections
- **AI Integration**: Gemini API

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v14 or higher)
- MongoDB
- Git

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/abhi963007/Nexis.git
   cd Nexis
   ```

2. **Set up the backend**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the backend directory:
   ```env
   PORT=3001
   MONGODB_URI=mongodb://127.0.0.1:27017/nexis
   JWT_SECRET=your-secret-key-here
   GEMINI_API_KEY=your-gemini-api-key
   ```

4. **Start the backend server**
   ```bash
   npm start
   ```

5. **Set up the frontend**
   ```bash
   cd ../frontend
   npx http-server -p 8080 --cors
   ```

## 🌐 Usage

1. Open your browser and navigate to `http://localhost:8080`
2. Create an account or log in
3. Access various features from the dashboard:
   - Start or join video calls
   - Share your screen
   - Create chat rooms
   - Use the AI assistant
   - Share files
   - Collaborate on the whiteboard

## 🔒 Security Features

- End-to-end encryption for messages
- Secure video and audio streaming
- JWT-based authentication
- Protected file sharing
- Secure room access with unique IDs

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Contact

For any queries or support, please contact:
- Email: [your-email@example.com]
- GitHub: [@abhi963007](https://github.com/abhi963007)

---

<p align="center">Made with ❤️ by Nexis Team</p> 