import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export const useWebSocket = (token, enabled = true) => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [socketInstance, setSocketInstance] = useState(null);

  useEffect(() => {
    if (!enabled) return;

    // Initialize socket connection
    socketRef.current = io(SOCKET_URL, {
      auth: {
        token: token || null
      },
      withCredentials: true, // Send cookies with connection
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    const socket = socketRef.current;
    setSocketInstance(socket);

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setReconnectAttempts(0);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setReconnectAttempts(prev => prev + 1);
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
      setSocketInstance(null);
    };
  }, [enabled, token]);

  return {
    socket: socketInstance,
    isConnected,
    reconnectAttempts
  };
};

