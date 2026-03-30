const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { authenticate } = require('../middleware/auth.middleware');

// Initialize Groq client
let groq;

try {
    if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is not set in environment variables');
    }
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log('Groq API initialized successfully');
} catch (error) {
    console.error('Failed to initialize Groq API:', error.message);
}

// Groq model to use — llama-3.3-70b-versatile is fast and capable
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// System prompt for the Nexis AI assistant
const SYSTEM_PROMPT = `You are Nexis AI, a helpful, smart, and concise AI assistant built into the Nexis collaboration platform. 
You help users with a wide range of tasks: answering questions, writing, coding, analysis, brainstorming, and more.
Be friendly, professional, and give clear, well-structured responses. Use markdown formatting where appropriate.`;

// Chat history storage (in-memory; use a database for production)
const chatHistory = new Map();   // chatId → Message[]
const chatMetadata = new Map();  // chatId → { title, timestamp, messageCount }

// ─────────────────────────────────────────
// POST /api/ai/chat/start  — create a new chat session
// ─────────────────────────────────────────
router.post('/chat/start', authenticate, async (req, res) => {
    try {
        if (!groq) throw new Error('Groq API not properly initialized');

        const chatId = Math.random().toString(36).substring(2, 9);
        chatHistory.set(chatId, []);
        chatMetadata.set(chatId, {
            title: 'New Chat',
            timestamp: new Date().toISOString(),
            messageCount: 0
        });
        console.log('New chat session created:', chatId);
        res.json({ ok: true, chatId });
    } catch (error) {
        console.error('Error starting chat:', error.message);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─────────────────────────────────────────
// POST /api/ai/chat/message  — send a message, get AI response
// ─────────────────────────────────────────
router.post('/chat/message', authenticate, async (req, res) => {
    try {
        if (!groq) {
            return res.status(500).json({
                ok: false,
                error: 'Groq API not initialized. Please check your GROQ_API_KEY.'
            });
        }

        const { message, chatId } = req.body;

        if (!message) return res.status(400).json({ ok: false, error: 'Message is required' });
        if (!chatId)  return res.status(400).json({ ok: false, error: 'Chat ID is required' });

        // Get or create history for this session
        let history = chatHistory.get(chatId);
        if (!history) {
            history = [];
            chatHistory.set(chatId, history);
        }

        // Build messages array: system prompt + full history + new user message
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            // Include prior turns for multi-turn conversation
            ...history.map(turn => ({ role: turn.role, content: turn.content })),
            { role: 'user', content: message }
        ];

        console.log(`[Groq] Sending message to ${GROQ_MODEL} | chatId: ${chatId}`);

        const completion = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages,
            temperature: 0.7,
            max_tokens: 2048,
            top_p: 0.9,
        });

        const responseText = completion.choices?.[0]?.message?.content?.trim();

        if (!responseText) {
            console.error('[Groq] Empty response received');
            return res.status(500).json({
                ok: false,
                error: 'AI returned an empty response. Please try again.'
            });
        }

        console.log('[Groq] Response received, tokens:', completion.usage?.total_tokens);

        // Persist conversation turn
        history.push({ role: 'user',      content: message });
        history.push({ role: 'assistant', content: responseText });
        chatHistory.set(chatId, history);

        // Update metadata
        const metadata = chatMetadata.get(chatId) || {};
        if (metadata.title === 'New Chat' && message) {
            metadata.title = message.substring(0, 50) + (message.length > 50 ? '…' : '');
        }
        metadata.messageCount = history.length;
        metadata.lastUpdated  = new Date().toISOString();
        chatMetadata.set(chatId, metadata);

        res.json({ ok: true, response: responseText });

    } catch (error) {
        console.error('[Groq] API Error:', error.message);

        let errorMessage = 'Error communicating with Groq API';
        if (error.message?.includes('API key') || error.status === 401) {
            errorMessage = 'Invalid Groq API key. Please check your GROQ_API_KEY in .env';
        } else if (error.status === 429) {
            errorMessage = 'Groq rate limit reached. Please wait a moment and try again.';
        } else if (error.status === 503 || error.message?.includes('overloaded')) {
            errorMessage = 'Groq servers are busy. Please try again in a moment.';
        }

        res.status(500).json({ ok: false, error: errorMessage, details: error.message });
    }
});

// ─────────────────────────────────────────
// GET /api/ai/chat/history/:chatId
// ─────────────────────────────────────────
router.get('/chat/history/:chatId', authenticate, async (req, res) => {
    try {
        const history = chatHistory.get(req.params.chatId) || [];
        res.json({ ok: true, history });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─────────────────────────────────────────
// GET /api/ai/chat/list
// ─────────────────────────────────────────
router.get('/chat/list', authenticate, async (req, res) => {
    try {
        const chats = [];
        for (const [chatId, metadata] of chatMetadata.entries()) {
            chats.push({ chatId, ...metadata });
        }
        chats.sort((a, b) =>
            new Date(b.lastUpdated || b.timestamp) - new Date(a.lastUpdated || a.timestamp)
        );
        res.json({ ok: true, chats });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─────────────────────────────────────────
// DELETE /api/ai/chat/:chatId
// ─────────────────────────────────────────
router.delete('/chat/:chatId', authenticate, async (req, res) => {
    try {
        const { chatId } = req.params;
        chatHistory.delete(chatId);
        chatMetadata.delete(chatId);
        console.log('Chat session deleted:', chatId);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;