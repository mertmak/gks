import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 30000,
});

// Interceptor (Araya Girici): Her istek backend'e gitmeden hemen önce çalışır
api.interceptors.request.use((config) => {
    // Tarayıcının hafızasından token'ı al
    const token = localStorage.getItem('token');
    
    // Eğer token varsa, bunu Authorization başlığına 'Bearer ...' formatında ekle
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

api.interceptors.response.use(response => response, error => {
    if (error.response?.status === 401 && !['/login', '/sifre-degistir'].includes(error.config?.url)) {
        // Only an open session can expire; anonymous 401s must not show the notice.
        const hadSession = !!localStorage.getItem('token');
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('gks:logout', { detail: { reason: hadSession ? 'session-expired' : '' } }));
    }
    return Promise.reject(error);
});
export default api;
