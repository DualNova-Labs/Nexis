const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini API with validation
let genAI;
let model;

try {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Configure model with safety settings
    const { HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

    const safetySettings = [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
    ];

    model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        safetySettings: safetySettings,
        generationConfig: {
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 2048,
        }
    });
    console.log('Gemini API initialized successfully with model: gemini-2.5-flash');
} catch (error) {
    console.error('Failed to initialize Gemini API:', error);
}

// Chat history storage (in-memory for demo, use database in production)
const chatHistory = new Map();
const chatMetadata = new Map(); // Store chat metadata (title, timestamp, etc.)

// Initialize a new chat
router.post('/chat/start', async (req, res) => {
    try {
        if (!model) {
            throw new Error('Gemini API not properly initialized');
        }

        const chatId = Math.random().toString(36).substring(7);
        chatHistory.set(chatId, []);
        chatMetadata.set(chatId, {
            title: 'New Chat',
            timestamp: new Date().toISOString(),
            messageCount: 0
        });
        console.log('New chat session created:', chatId);
        res.json({ ok: true, chatId });
    } catch (error) {
        console.error('Error starting chat:', error);
        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

// Send message and get response
router.post('/chat/message', async (req, res) => {
    try {
        if (!model) {
            return res.status(500).json({
                ok: false,
                error: 'Gemini API not properly initialized. Please check your API key.'
            });
        }

        const { message, chatId } = req.body;
        console.log('Received request:', { message, chatId });

        if (!message) {
            return res.status(400).json({ ok: false, error: 'Message is required' });
        }

        if (!chatId) {
            return res.status(400).json({ ok: false, error: 'Chat ID is required' });
        }

        // Get or initialize chat history
        let history = chatHistory.get(chatId);
        if (!history) {
            console.log('No history found for chatId:', chatId);
            history = [];
            chatHistory.set(chatId, history);
        }

        try {
            // Simply send the message without complex history formatting
            console.log('=== Sending message to Gemini API ===');
            console.log('Message:', message);
            console.log('API Key exists:', !!process.env.GEMINI_API_KEY);
            console.log('API Key length:', process.env.GEMINI_API_KEY?.length);

            const result = await model.generateContent(message);
            const response = await result.response;

            // Check for safety ratings that might have blocked content
            const safetyRatings = response.promptFeedback?.safetyRatings;
            if (safetyRatings) {
                console.log('Safety ratings:', safetyRatings);
            }

            // Check if response was blocked
            if (response.promptFeedback?.blockReason) {
                console.error('Response blocked:', response.promptFeedback.blockReason);
                return res.status(400).json({
                    ok: false,
                    error: 'Your message was blocked by safety filters. Please try rephrasing.',
                    details: response.promptFeedback.blockReason
                });
            }

            // Get the text, handling empty responses
            let responseText;
            try {
                responseText = response.text();
            } catch (textError) {
                console.error('Error getting text from response:', textError);
                // Try to get text from candidates
                if (response.candidates && response.candidates.length > 0) {
                    const candidate = response.candidates[0];
                    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                        responseText = candidate.content.parts[0].text;
                    }
                }
            }

            if (!responseText || responseText.trim() === '') {
                console.error('Empty response received from API');
                return res.status(500).json({
                    ok: false,
                    error: 'Received empty response from AI. Please try again with a different message.',
                    details: 'Empty model output'
                });
            }

            console.log('Successfully received response from Gemini API');
            console.log('Response preview:', responseText.substring(0, 100));

            // Store messages in history
            history.push({ role: 'user', content: message });
            history.push({ role: 'assistant', content: responseText });
            chatHistory.set(chatId, history);

            // Update chat metadata
            const metadata = chatMetadata.get(chatId);
            if (metadata) {
                // Set title from first message if still "New Chat"
                if (metadata.title === 'New Chat' && message) {
                    metadata.title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
                }
                metadata.messageCount = history.length;
                metadata.lastUpdated = new Date().toISOString();
                chatMetadata.set(chatId, metadata);
            }

            res.json({
                ok: true,
                response: responseText
            });
        } catch (apiError) {
            console.error('=== GEMINI API ERROR ===');
            console.error('Name:', apiError.name);
            console.error('Message:', apiError.message);
            console.error('Full Error Object:', apiError);
            console.error('=======================');

            // Provide more specific error messages
            let errorMessage = 'Error communicating with Gemini API';

            if (apiError.message?.includes('empty')) {
                errorMessage = 'AI returned an empty response. Please try rephrasing your message.';
            } else if (apiError.message?.includes('API key') || apiError.message?.includes('API_KEY_INVALID')) {
                errorMessage = 'Invalid API key. Please check your GEMINI_API_KEY in .env file.';
            } else if (apiError.message?.includes('quota') || apiError.message?.includes('RESOURCE_EXHAUSTED')) {
                errorMessage = 'API quota exceeded. Please check your Google AI Studio quota.';
            } else if (apiError.message?.includes('SAFETY') || apiError.message?.includes('blocked')) {
                errorMessage = 'Response blocked by safety filters. Try rephrasing your question.';
            } else if (apiError.message?.includes('404') || apiError.message?.includes('Not Found')) {
                errorMessage = 'Model not found. The API may have been updated. Please contact support.';
            }

            res.status(500).json({
                ok: false,
                error: errorMessage,
                details: apiError.message
            });
        }
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({
            ok: false,
            error: error.message || 'Internal server error'
        });
    }
});

// Get chat history
router.get('/chat/history/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const history = chatHistory.get(chatId) || [];
        res.json({ ok: true, history });
    } catch (error) {
        console.error('Error getting history:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// List all chats
router.get('/chat/list', async (req, res) => {
    try {
        const chats = [];
        for (const [chatId, metadata] of chatMetadata.entries()) {
            chats.push({
                chatId,
                ...metadata
            });
        }
        // Sort by last updated (most recent first)
        chats.sort((a, b) => new Date(b.lastUpdated || b.timestamp) - new Date(a.lastUpdated || a.timestamp));
        res.json({ ok: true, chats });
    } catch (error) {
        console.error('Error listing chats:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Delete a chat
router.delete('/chat/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        chatHistory.delete(chatId);
        chatMetadata.delete(chatId);
        console.log('Chat session deleted:', chatId);
        res.json({ ok: true });
    } catch (error) {
        console.error('Error deleting chat:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;