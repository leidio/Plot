import { useState, useEffect } from 'react';

export const usePresence = ({ socket, isConnected, movement, currentUser }) => {
  const [viewers, setViewers] = useState([]);

  useEffect(() => {
    if (!socket || !isConnected || !movement || !currentUser) return;

    socket.emit('join:movement', movement.id);

    const currentUserViewer = {
      userId: currentUser.id,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      avatar: currentUser.avatar
    };

    const handlePresenceUpdate = (data) => {
      if (data.movementId === movement.id && data.viewers) {
        const allViewers = [...data.viewers];
        const hasCurrentUser = allViewers.some(v => v && v.userId === currentUser.id);
        if (!hasCurrentUser) {
          allViewers.push(currentUserViewer);
        }

        allViewers.sort((a, b) => {
          if (a.userId === currentUser.id) return -1;
          if (b.userId === currentUser.id) return 1;
          return 0;
        });
        setViewers(allViewers);
      }
    };

    const handleUserJoined = (data) => {
      if (data.movementId === movement.id) {
        handlePresenceUpdate(data);
      }
    };

    const handleUserLeft = (data) => {
      if (data.movementId === movement.id) {
        handlePresenceUpdate(data);
      }
    };

    socket.on('presence:update', handlePresenceUpdate);
    socket.on('user:joined', handleUserJoined);
    socket.on('user:left', handleUserLeft);

    setViewers([currentUserViewer]);

    return () => {
      socket.emit('leave:movement', movement.id);
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('user:joined', handleUserJoined);
      socket.off('user:left', handleUserLeft);
    };
  }, [socket, isConnected, movement, currentUser]);

  return viewers;
};

