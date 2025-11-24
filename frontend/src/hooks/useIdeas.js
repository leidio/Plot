import { useState, useCallback } from 'react';

export const useIdeas = (apiCall) => {
  const [ideas, setIdeas] = useState([]);

  const loadIdeas = useCallback(async (movementId) => {
    if (!movementId) {
      setIdeas([]);
      return;
    }

    try {
      const response = await apiCall('get', `/ideas?movementId=${movementId}`);
      const loadedIdeas = response.data.ideas || [];
      setIdeas(loadedIdeas);
    } catch (error) {
      console.error('Error loading ideas:', error);
      setIdeas([]);
    }
  }, [apiCall]);

  return { ideas, setIdeas, loadIdeas };
};

