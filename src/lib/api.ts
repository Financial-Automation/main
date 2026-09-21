// API Configuration utility
const isDevelopment = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.'));

// Get the appropriate API URL based on environment
export const getApiUrl = (): string => {
  if (isDevelopment) {
    return import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
  }
  return 'https://software.saaiss.in/api';
};

// Base API URL
export const API_BASE_URL = getApiUrl();

// API endpoints
export const API_ENDPOINTS = {
  // Auth endpoints
  SIGNUP: `${API_BASE_URL}/signup`,
  SIGNUP_TRIAL: `${API_BASE_URL}/signup-trial`,
  SIGNIN: `${API_BASE_URL}/signin`,
  USER: `${API_BASE_URL}/user`,
  UPDATE_PROFILE: `${API_BASE_URL}/user`,

  // Payment endpoints
  CREATE_ORDER: `${API_BASE_URL}/create-order`,
  VERIFY_PAYMENT: `${API_BASE_URL}/verify-payment`,

  // Health check
  HEALTH: `${API_BASE_URL}/health`,

  // Other endpoints
  PAYROLL: `${API_BASE_URL}/payroll`,
  TAX: `${API_BASE_URL}/tax`,
  BALANCE: `${API_BASE_URL}/balance`,
  PROFIT_LOSS: `${API_BASE_URL}/profitloss`,

  // Invoice endpoint
  INVOICE: `${API_BASE_URL}/invoice`,
  INVOICE_SUMMARY: `${API_BASE_URL}/invoice-summary`,

  // AI endpoints
  AI: `${API_BASE_URL}/ai`,
  AI_INVOICE_OCR: `${API_BASE_URL}/ai/invoice-ocr`,
  AI_EXTRACT_TEXT: `${API_BASE_URL}/ai/extract-text`,
  AI_CHAT_HISTORY: `${API_BASE_URL}/ai/chat-history`,
  AI_CHAT_MESSAGE: `${API_BASE_URL}/ai/chat-message`,

  // Civil Engineering endpoints
  CIVIL_CPM_CALCULATE: `${API_BASE_URL}/civil-engineering/calculate-cpm`,
  CIVIL_SAVE_PROJECT: `${API_BASE_URL}/civil-engineering/save-project`,
  CIVIL_GET_HISTORY: `${API_BASE_URL}/civil-engineering/history`,
} as const;

// Helper function for making API requests
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add authorization header if token exists
  const token = localStorage.getItem('token');
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  // Ensure port 5001 is tried before port 5000 (macOS AirPlay occupies port 5000)
  const normalizedEndpoint = endpoint.replace("http://localhost:5000/api", "http://localhost:5001/api");
  const endpoints = [
    normalizedEndpoint,
    endpoint,
    endpoint.replace("http://localhost:5001/api", "http://localhost:5000/api"),
  ].filter((value, index, list) => list.indexOf(value) === index);

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (const requestEndpoint of endpoints) {
    try {
      const response = await fetch(requestEndpoint, config);

      // macOS AirPlay occupies port 5000 and returns 403 or non-API responses.
      // If we got a 403 from port 5000, skip it to try port 5001.
      if (!response.ok && requestEndpoint.includes(":5000") && response.status === 403) {
        lastResponse = response;
        continue;
      }

      // Safeguard against HTML responses (e.g. Nginx 502/504 Bad Gateway, 404 HTML, or SPA fallback)
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const text = await response.clone().text();
        if (text.trim().startsWith("<") || text.includes("<html>")) {
          const htmlMsg = response.status === 502
            ? "Production backend server is currently unreachable (502 Bad Gateway). Please verify the backend process is active."
            : response.status === 504
            ? "Production backend server timed out (504 Gateway Timeout)."
            : `API server returned an HTML response (${response.status}) instead of JSON.`;

          const jsonErrorBody = JSON.stringify({
            success: false,
            message: htmlMsg
          });

          return new Response(jsonErrorBody, {
            status: response.status >= 400 ? response.status : 500,
            statusText: response.statusText,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    const contentType = lastResponse.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const jsonErrorBody = JSON.stringify({
        success: false,
        message: `API server returned an HTML error (${lastResponse.status}).`
      });
      return new Response(jsonErrorBody, {
        status: lastResponse.status >= 400 ? lastResponse.status : 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return lastResponse;
  }

  console.error("API request failed:", lastError);
  const fallbackJson = JSON.stringify({
    success: false,
    message: "API server is not reachable. Please check backend connection."
  });
  return new Response(fallbackJson, {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Log current API configuration (for debugging)
console.log('🔧 API Configuration:', {
  isDevelopment,
  apiUrl: API_BASE_URL,
  environment: isDevelopment ? 'Development' : 'Production'
});
