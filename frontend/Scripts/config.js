// ============================================================
// Nexis - Global API Configuration
// Automatically switches between local and production URLs
// ============================================================

(function () {
    const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '';

    // --- IMPORTANT FOR PRODUCTION ---
    // Replace the value below with your actual Render backend URL
    // Example: 'https://nexis-backend.onrender.com'
    const PRODUCTION_BACKEND_URL = 'https://nexis-production-1666.up.railway.app';

    if (isLocalhost) {
        window.API_URL = 'http://localhost:3001';
        window.WS_URL = 'ws://localhost:3001';
    } else {
        window.API_URL = PRODUCTION_BACKEND_URL;
        window.WS_URL = PRODUCTION_BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    }

    console.log(`[Nexis Config] Environment: ${isLocalhost ? 'LOCAL' : 'PRODUCTION'}`);
    console.log(`[Nexis Config] API_URL → ${window.API_URL}`);
    console.log(`[Nexis Config] WS_URL  → ${window.WS_URL}`);
})();
