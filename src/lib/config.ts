// ============================================
// SEONE CONFIGURATION
// Environment and API configuration
// ============================================

export const config = {
    // API Configuration
    api: {
        baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
        version: 'v1',
        timeout: 30000,
    },

    // WebSocket Configuration
    ws: {
        baseUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000',
        reconnectAttempts: 5,
        reconnectDelay: 1000,
    },

    // Google OAuth Configuration
    auth: {
        googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
        allowedDomain: 'creativefuel.io',
        tokenCookieName: 'seone_token',
        tokenExpiry: 7, // days
    },

    // Media Configuration
    media: {
        dataBaseUrl: process.env.NEXT_PUBLIC_DATA_URL || 'http://localhost:8000/data',
    },
} as const;

// API Endpoints
export const endpoints = {
    auth: {
        google: '/api/v1/auth/google',
        me: '/api/v1/auth/me',
        logout: '/api/v1/auth/logout',
    },
    jobs: {
        list: '/api/v1/jobs',
        create: '/api/v1/jobs',
        get: (id: string) => `/api/v1/jobs/${id}`,
        delete: (id: string) => `/api/v1/jobs/${id}`,
    },
    pages: {
        list: '/api/v1/pages',
        get: (id: string) => `/api/v1/pages/${id}`,
    },
    ws: {
        job: (jobId: string) => `/ws/jobs/${jobId}`,
    },
} as const;

// Helper to get full API URL
export const getApiUrl = (endpoint: string): string => {
    return `${config.api.baseUrl}${endpoint}`;
};

// Helper to get full WebSocket URL
export const getWsUrl = (endpoint: string): string => {
    return `${config.ws.baseUrl}${endpoint}`;
};

// Helper to get media URL
export const getMediaUrl = (path: string): string => {
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${config.media.dataBaseUrl}/${cleanPath}`;
};

// ============================================
// PROTOCOL VALIDATION
// Detect mixed-content WebSocket misconfigurations at startup
// ============================================

/**
 * Validate WebSocket protocol matches page security.
 * Runs once on app init. Logs fatal error if mismatch detected.
 */
function validateWsConfig(): void {
    // Only run in browser
    if (typeof window === 'undefined') return;

    const isSecurePage = window.location.protocol === 'https:';
    const isSecureWs = config.ws.baseUrl.startsWith('wss://');

    if (isSecurePage && !isSecureWs) {
        console.error(
            '[FATAL CONFIG] Secure page (https) attempting non-secure WebSocket (ws://).\n' +
            `Current WS URL: ${config.ws.baseUrl}\n` +
            'Fix NEXT_PUBLIC_WS_URL to use wss:// in production.'
        );
    }

    // Optional: warn about insecure WS in production builds
    if (process.env.NODE_ENV === 'production' && !isSecureWs) {
        console.warn(
            '[CONFIG WARNING] WebSocket URL is not secure (wss://).\n' +
            'This may cause connection failures in production.'
        );
    }
}

// Run validation on module load
validateWsConfig();
