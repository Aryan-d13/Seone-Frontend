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
