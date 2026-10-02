import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export const socket = io(SOCKET_URL, {
    autoConnect: false, // Token hazır olmadan bağlanma
    auth: (cb) => {
        // Her (yeniden) bağlantıda güncel token'ı gönder
        cb({ token: localStorage.getItem('token') });
    },
});

// Token alındıktan sonra bağlanmak için çağrılır
export const connectSocket = () => {
    if (!socket.connected) socket.connect();
};

// Çıkışta bağlantıyı kes
export const disconnectSocket = () => {
    socket.disconnect();
};
