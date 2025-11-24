import { useState, useCallback, useEffect, useRef } from 'react';

export const useMovements = (apiCall) => {
  const [movements, setMovements] = useState([]);
  const [searchResults, setSearchResults] = useState({ movements: [], ideas: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef(null);

  const loadMovements = useCallback(async (city = null, state = null) => {
    try {
      const params = new URLSearchParams();
      if (city) params.append('city', city);
      if (state) params.append('state', state);
      const queryString = params.toString();
      const url = `/movements${queryString ? `?${queryString}` : ''}`;
      const response = await apiCall('get', url);
      setMovements(response.data.movements || []);
    } catch (error) {
      console.error('Error loading movements:', error);
      setMovements([]);
    }
  }, [apiCall]);

  useEffect(() => {
    let refreshRafId = null;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchQuery.trim()) {
      refreshRafId = requestAnimationFrame(() => {
        loadMovements();
        setSearchResults({ movements: [], ideas: [] });
        setIsSearching(false);
      });
      return () => {
        if (refreshRafId) cancelAnimationFrame(refreshRafId);
      };
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await apiCall('get', `/search?q=${encodeURIComponent(searchQuery)}`);
        const results = {
          movements: response.data.movements || [],
          ideas: response.data.ideas || []
        };
        setSearchResults(results);
        setMovements(results.movements);
        setIsSearching(false);
      } catch (error) {
        console.error('Error searching:', error);
        setSearchResults({ movements: [], ideas: [] });
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, loadMovements, apiCall]);

  return {
    movements,
    searchResults,
    isSearching,
    searchQuery,
    setSearchQuery,
    loadMovements
  };
};

