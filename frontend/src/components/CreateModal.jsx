import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import { X, Image as ImageIcon, Upload, Sparkles, MapPin } from 'lucide-react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { useTheme } from '../hooks/useTheme';

const DESCRIPTION_MAX_LENGTH = 2000;

const CreateModal = ({ type, movement, initialCoordinates, mapRef, onClose, onSuccess, apiCall }) => {
  const { isDark } = useTheme();
  const isMovement = type === 'movement';
  const [creationStep, setCreationStep] = useState(isMovement ? 'location' : 'details');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    tags: '',
    address: '',
    fundingGoal: ''
  });
  const [images, setImages] = useState([]);
  const [coverImage, setCoverImage] = useState(null);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationMode, setLocationMode] = useState('search'); // 'search' | 'draw'
  const [drawnBoundary, setDrawnBoundary] = useState(null);   // GeoJSON polygon or null
  const [boundaryCity, setBoundaryCity] = useState('');
  const [boundaryState, setBoundaryState] = useState('');
  const [boundaryPlaceName, setBoundaryPlaceName] = useState('');
  const [boundaryGeocoding, setBoundaryGeocoding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reverseGeocodedAddress, setReverseGeocodedAddress] = useState('');
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResultType, setAiResultType] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [draftTasks, setDraftTasks] = useState([]);
  const [focusedAiField, setFocusedAiField] = useState(null);
  const [aiAnchorField, setAiAnchorField] = useState(null);
  const locationInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const coverImageInputRef = useRef(null);
  const aiPopoverRef = useRef(null);
  const popoverJustOpenedRef = useRef(false);
  const drawMapContainerRef = useRef(null);
  const drawMapRef = useRef(null);
  const drawRef = useRef(null);
  const locationMarkerRef = useRef(null);

  const isLocationSet = () => {
    if (locationMode === 'search') return !!selectedLocation;
    return !!drawnBoundary;
  };

  // Place marker on main map when user selects a search result (movement step 1)
  useEffect(() => {
    if (!isMovement || creationStep !== 'location' || locationMode !== 'search' || !selectedLocation || !mapRef?.current) return;
    const mapInstance = mapRef.current;
    mapInstance.flyTo({
      center: [selectedLocation.longitude, selectedLocation.latitude],
      zoom: Math.max(mapInstance.getZoom(), 12)
    });
    if (locationMarkerRef.current) {
      locationMarkerRef.current.remove();
      locationMarkerRef.current = null;
    }
    const el = document.createElement('div');
    el.className = 'movement-create-marker';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#16a34a';
    el.style.border = '2px solid white';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([selectedLocation.longitude, selectedLocation.latitude])
      .addTo(mapInstance);
    locationMarkerRef.current = marker;
    return () => {
      if (locationMarkerRef.current) {
        locationMarkerRef.current.remove();
        locationMarkerRef.current = null;
      }
    };
  }, [isMovement, creationStep, locationMode, selectedLocation, mapRef]);

  // Draw on main map when movement step 1 and draw mode
  useEffect(() => {
    if (!isMovement || creationStep !== 'location' || locationMode !== 'draw' || !mapRef?.current) return;
    const mapInstance = mapRef.current;
    let loadListener = null;
    const cleanupRef = { current: () => {} };

    const addDrawControl = () => {
      if (drawRef.current) return;
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true }
      });
      mapInstance.addControl(draw, 'top-left');
      drawRef.current = draw;
      const onDrawUpdate = () => {
        const features = draw.getAll();
        const polygon = features.features.find(f => f.geometry?.type === 'Polygon');
        if (polygon) {
          setDrawnBoundary(polygon.geometry);
          reverseGeocodeBoundary(polygon.geometry);
        } else {
          setDrawnBoundary(null);
          setBoundaryCity('');
          setBoundaryState('');
          setBoundaryPlaceName('');
        }
      };
      mapInstance.on('draw.create', onDrawUpdate);
      mapInstance.on('draw.update', onDrawUpdate);
      mapInstance.on('draw.delete', onDrawUpdate);
      cleanupRef.current = () => {
        mapInstance.off('draw.create', onDrawUpdate);
        mapInstance.off('draw.update', onDrawUpdate);
        mapInstance.off('draw.delete', onDrawUpdate);
        if (drawRef.current) {
          try {
            mapInstance.removeControl(drawRef.current);
          } catch (_) {}
          drawRef.current = null;
        }
      };
    };

    if (mapInstance.getStyle()?.sources) {
      addDrawControl();
    } else {
      loadListener = () => addDrawControl();
      mapInstance.once('load', loadListener);
    }
    return () => {
      cleanupRef.current();
      if (loadListener) {
        mapInstance.off('load', loadListener);
      }
    };
  }, [isMovement, creationStep, locationMode, mapRef]);

  // Cleanup marker and draw when modal closes
  useEffect(() => {
    return () => {
      if (locationMarkerRef.current) {
        locationMarkerRef.current.remove();
        locationMarkerRef.current = null;
      }
      if (mapRef?.current && drawRef.current) {
        mapRef.current.removeControl(drawRef.current);
        drawRef.current = null;
      }
    };
  }, [mapRef]);

  useEffect(() => {
    if (initialCoordinates && type === 'idea') {
      const reverseGeocode = async () => {
        try {
          const response = await axios.get(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${initialCoordinates.longitude},${initialCoordinates.latitude}.json`,
            {
              params: {
                access_token: mapboxgl.accessToken,
                limit: 1
              }
            }
          );

          if (response.data.features && response.data.features.length > 0) {
            const address = response.data.features[0].place_name;
            setReverseGeocodedAddress(address);
            setFormData(prev => ({ ...prev, address }));
          }
        } catch (err) {
          console.error('Reverse geocoding error:', err);
        }
      };
      reverseGeocode();
    }
  }, [initialCoordinates, type]);

  const fetchLocationSuggestions = async (query) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query || query.length < 2) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await axios.get(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
          {
            params: {
              access_token: mapboxgl.accessToken,
              country: 'us',
              types: 'place,neighborhood,locality,district,postcode',
              autocomplete: true,
              limit: 5
            }
          }
        );

        if (response.data.features) {
          setLocationSuggestions(response.data.features);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Location search error:', err);
        setLocationSuggestions([]);
      }
    }, 300);
  };

  const polygonCentroid = (geometry) => {
    const coords = geometry?.coordinates?.[0];
    if (!Array.isArray(coords) || coords.length < 3) return null;
    let sumLng = 0, sumLat = 0, n = 0;
    for (const p of coords) {
      const [lng, lat] = Array.isArray(p) ? p : [p?.lng ?? p?.x, p?.lat ?? p?.y];
      if (typeof lng === 'number' && typeof lat === 'number') {
        sumLng += lng; sumLat += lat; n++;
      }
    }
    if (n === 0) return null;
    return [sumLng / n, sumLat / n];
  };

  const reverseGeocodeBoundary = async (geometry) => {
    const center = polygonCentroid(geometry);
    if (!center) return;
    setBoundaryGeocoding(true);
    setBoundaryCity('');
    setBoundaryState('');
    setBoundaryPlaceName('');
    try {
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${center[0]},${center[1]}.json`,
        {
          params: {
            access_token: mapboxgl.accessToken,
            limit: 1,
            types: 'place,locality,neighborhood,postcode,region'
          }
        }
      );
      if (response.data.features?.length > 0) {
        const parsed = parseLocation(response.data.features[0]);
        setBoundaryCity(parsed.city || '');
        setBoundaryState(parsed.state || '');
        setBoundaryPlaceName(parsed.fullName || '');
      }
    } catch (err) {
      console.error('Reverse geocode boundary error:', err);
    } finally {
      setBoundaryGeocoding(false);
    }
  };

  const parseLocation = (feature) => {
    const context = feature.context || [];
    let city = '';
    let state = '';
    let neighborhood = '';

    context.forEach(item => {
      if (item.id.startsWith('place.')) {
        city = item.text;
      } else if (item.id.startsWith('region.')) {
        state = item.short_code?.replace('US-', '') || item.text;
      } else if (item.id.startsWith('neighborhood.')) {
        neighborhood = item.text;
      }
    });

    if (feature.place_type?.includes('neighborhood')) {
      if (!city && feature.text) {
        city = feature.text;
      }
      if (neighborhood) {
        city = neighborhood;
      }
    } else if (feature.place_type?.includes('place')) {
      city = feature.text;
    }

    if (!city) {
      city = feature.text;
    }

    if (!state) {
      const stateItem = context.find(item => item.id.startsWith('region.'));
      if (stateItem) {
        state = stateItem.short_code?.replace('US-', '') || stateItem.text;
      }
    }

    const [longitude, latitude] = feature.center;

    return {
      city,
      state,
      latitude,
      longitude,
      fullName: feature.place_name
    };
  };

  const handleLocationChange = (value) => {
    setFormData(prev => ({ ...prev, location: value }));
    setSelectedLocation(null);
    fetchLocationSuggestions(value);
  };

  const handleLocationSelect = (feature) => {
    const parsed = parseLocation(feature);
    setSelectedLocation(parsed);
    setFormData(prev => ({ ...prev, location: parsed.fullName }));
    setLocationSuggestions([]);
    setShowSuggestions(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        locationInputRef.current &&
        !locationInputRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Close AI popover when clicking outside (skip the same mousedown that opened it)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverJustOpenedRef.current) {
        popoverJustOpenedRef.current = false;
        return;
      }
      if (
        aiDropdownOpen &&
        aiPopoverRef.current &&
        !aiPopoverRef.current.contains(event.target)
      ) {
        setAiDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [aiDropdownOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (type === 'movement') {
        const tags = formData.tags
          ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
          : [];

        if (locationMode === 'draw') {
          if (!formData.name || !formData.description || !drawnBoundary || !boundaryCity.trim() || !boundaryState.trim()) {
            setError('Please fill in name, description, draw a boundary on the map, and enter city and state.');
            setLoading(false);
            return;
          }
          const response = await apiCall('post', '/movements', {
            name: formData.name,
            description: formData.description,
            city: boundaryCity.trim(),
            state: boundaryState.trim(),
            boundary: drawnBoundary,
            tags
          });
          if (response.data.movement) {
            onSuccess();
          } else {
            throw new Error('Failed to create movement');
          }
        } else {
          if (!formData.name || !formData.description || !selectedLocation) {
            setError('Please fill in all required fields and select a location from the suggestions');
            setLoading(false);
            return;
          }
          const response = await apiCall('post', '/movements', {
            name: formData.name,
            description: formData.description,
            city: selectedLocation.city,
            state: selectedLocation.state,
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
            tags
          });
          if (response.data.movement) {
            onSuccess();
          } else {
            throw new Error('Failed to create movement');
          }
        }
      } else if (type === 'idea') {
        if (!formData.name || !formData.description || !movement) {
          setError('Please fill in all required fields');
          setLoading(false);
          return;
        }

        const latitude = initialCoordinates?.latitude;
        const longitude = initialCoordinates?.longitude;

        if (!latitude || !longitude) {
          setError('Location is required. Please click on the map to set the location.');
          setLoading(false);
          return;
        }

        const fundingGoalInCents = formData.fundingGoal ? Math.round(parseFloat(formData.fundingGoal) * 100) : 0;

        const response = await apiCall('post', '/ideas', {
          title: formData.name,
          description: formData.description,
          movementId: movement.id,
          latitude,
          longitude,
          address: formData.address || reverseGeocodedAddress || '',
          fundingGoal: fundingGoalInCents,
          coverImage: coverImage || null,
          images: images
        });

        if (response.data.idea) {
          const ideaId = response.data.idea.id;
          if (draftTasks.length > 0) {
            for (const task of draftTasks) {
              await apiCall('post', `/ideas/${ideaId}/tasks`, {
                title: task.title,
                description: task.description || undefined,
                order: draftTasks.indexOf(task)
              });
            }
          }
          onSuccess();
        } else {
          throw new Error('Failed to create idea - invalid response');
        }
      }
    } catch (err) {
      console.error(`Error creating ${type}:`, err);
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        setError('Cannot connect to server. Make sure the backend is running on port 3001.');
      } else if (err.response) {
        const errorMessage = err.response.data?.error?.message ||
          err.response.data?.message ||
          `Failed to create ${type}`;
        setError(errorMessage);
      } else {
        setError(
          err.message ||
          `Failed to create ${type}. Please try again.`
        );
      }
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleAiAction = async (actionType) => {
    setAiError('');
    setAiResult(null);
    setAiResultType(null);
    setAiLoading(true);
    setAiDropdownOpen(false);
    try {
      const payload = {
        type: actionType,
        entityType: type,
        text: formData.description,
        title: formData.name
      };
      if (actionType === 'suggest_tags') {
        payload.location = selectedLocation
          ? `${selectedLocation.city}, ${selectedLocation.state}`
          : (formData.location || '');
      }
      const response = await apiCall('post', '/ai/improve', payload);
      const data = response.data;

      if (actionType === 'rewrite' || actionType === 'tone') {
        if (data.result) {
          handleChange('description', data.result);
        }
        setAiResult(null);
        setAiResultType(null);
      } else if (actionType === 'review') {
        setAiResultType('review');
        setAiResult({
          score: data.score,
          summary: data.summary,
          suggestions: data.suggestions || []
        });
      } else if (actionType === 'suggestions') {
        setAiResultType('suggestions');
        setAiResult({ suggestions: data.suggestions || [] });
      } else if (actionType === 'tasks') {
        setAiResultType('tasks');
        const tasks = data.tasks || [];
        setDraftTasks(tasks);
        setAiResult({ tasks });
      } else if (actionType === 'suggest_tags') {
        setAiResultType('suggest_tags');
        setAiResult({ tags: data.tags || [] });
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'AI request failed';
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const openAiPopover = (e, anchorField) => {
    if (e) e.preventDefault();
    popoverJustOpenedRef.current = true;
    setAiAnchorField(anchorField);
    setAiDropdownOpen(true);
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageUpload = async (e, isCover = false) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Limit file size to 10MB
    const maxSize = 10 * 1024 * 1024;
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        setError(`File ${file.name} is too large. Maximum size is 10MB.`);
        return false;
      }
      return true;
    });

    try {
      if (isCover) {
        const base64 = await convertToBase64(validFiles[0]);
        setCoverImage(base64);
      } else {
        const base64Images = await Promise.all(validFiles.map(convertToBase64));
        setImages(prev => [...prev, ...base64Images]);
      }
    } catch (error) {
      console.error('Error converting image:', error);
      setError('Failed to process image. Please try again.');
    }
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeCoverImage = () => {
    setCoverImage(null);
  };

  const aiPopoverActions = (
    <div className="p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={aiLoading} onClick={() => handleAiAction('rewrite')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${isDark ? 'bg-emerald-700/50 text-emerald-200 hover:bg-emerald-700' : 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300'} disabled:opacity-50`}>Rewrite for clarity</button>
        <button type="button" disabled={aiLoading} onClick={() => handleAiAction('tone')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${isDark ? 'bg-emerald-700/50 text-emerald-200 hover:bg-emerald-700' : 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300'} disabled:opacity-50`}>Change tone</button>
        <button type="button" disabled={aiLoading} onClick={() => handleAiAction('review')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${isDark ? 'bg-emerald-700/50 text-emerald-200 hover:bg-emerald-700' : 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300'} disabled:opacity-50`}>Review for inclusive language</button>
        <button type="button" disabled={aiLoading} onClick={() => handleAiAction('suggestions')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${isDark ? 'bg-emerald-700/50 text-emerald-200 hover:bg-emerald-700' : 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300'} disabled:opacity-50`}>Suggest improvements</button>
        {type === 'idea' && <button type="button" disabled={aiLoading} onClick={() => handleAiAction('tasks')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${isDark ? 'bg-emerald-700/50 text-emerald-200 hover:bg-emerald-700' : 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300'} disabled:opacity-50`}>Suggest tasks</button>}
      </div>
      {aiLoading && <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Thinking...</p>}
      {aiError && <p className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>{aiError}</p>}
    </div>
  );

  // Step 1: Where do you want your movement? (map stays visible)
  if (isMovement && creationStep === 'location') {
    return (
      <>
        <div className="fixed inset-0 z-40 pointer-events-none" aria-hidden />
        <div className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-xl ${isDark ? 'bg-gray-800' : 'bg-white'} border-t border-gray-200 dark:border-gray-700 max-h-[45vh] flex flex-col`}>
          <div className="p-4 flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
            <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              Where do you want your movement?
            </h2>
            <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Search for a place or draw a boundary on the map. You can pan and zoom the map as usual.
            </p>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocationMode('search');
                  setDrawnBoundary(null);
                  setBoundaryCity('');
                  setBoundaryState('');
                  setBoundaryPlaceName('');
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${locationMode === 'search' ? (isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white') : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300')}`}
              >
                Search location
              </button>
              <button
                type="button"
                onClick={() => { setLocationMode('draw'); setSelectedLocation(null); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${locationMode === 'draw' ? (isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white') : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300')}`}
              >
                <MapPin className="w-4 h-4" />
                Draw boundary on map
              </button>
            </div>
            {locationMode === 'search' ? (
              <div className="relative" ref={locationInputRef}>
                <input
                  type="text"
                  placeholder="Address, neighborhood, city, or ZIP"
                  value={formData.location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  onFocus={() => formData.location && setShowSuggestions(true)}
                  className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
                  autoComplete="off"
                />
                {showSuggestions && locationSuggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className={`absolute z-[60] w-full mt-1 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'} border rounded-lg shadow-lg max-h-52 overflow-y-auto`}
                  >
                    {locationSuggestions.map((feature, index) => (
                      <button
                        key={feature.id || index}
                        type="button"
                        onClick={() => handleLocationSelect(feature)}
                        className={`w-full text-left px-4 py-3 ${isDark ? 'hover:bg-gray-600 border-gray-600 text-gray-100' : 'hover:bg-gray-50 border-gray-100'} border-b last:border-b-0 transition-colors`}
                      >
                        <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{feature.text}</div>
                        <div className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {feature.place_name?.replace(feature.text + ', ', '')}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedLocation && (
                  <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Selected: {selectedLocation.city}, {selectedLocation.state}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  Use the polygon tool on the map (top-left) to draw your area. Click to add points and close the shape. City and state are detected from the drawn area.
                </p>
                {drawnBoundary && (
                  <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${isDark ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                    {boundaryGeocoding ? (
                      <span>Detecting location…</span>
                    ) : boundaryPlaceName || boundaryCity || boundaryState ? (
                      <span>{boundaryPlaceName || `${boundaryCity}, ${boundaryState}`}</span>
                    ) : (
                      <span className={isDark ? 'text-amber-400' : 'text-amber-600'}>Could not detect location. Try drawing a larger area or try search instead.</span>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (locationMode === 'draw' && (!drawnBoundary || !boundaryCity.trim() || !boundaryState.trim())) return;
                  if (locationMode === 'search' && !selectedLocation) return;
                  setCreationStep('details');
                }}
                disabled={!isLocationSet() || (locationMode === 'draw' && (boundaryGeocoding || !boundaryCity.trim() || !boundaryState.trim()))}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Step 2 (details form) or Idea form
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : ''}`}>
            {isMovement ? 'Create movement' : 'Create Idea'}
          </h2>
          {isMovement && (
            <button
              type="button"
              onClick={() => setCreationStep('location')}
              className={`text-sm font-medium ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              ← Change location
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title — floaty when focused */}
          <div className="relative">
            <input
              type="text"
              placeholder={type === 'movement' ? 'Movement Name *' : 'Idea Title'}
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              onFocus={() => setFocusedAiField('name')}
              onBlur={() => setFocusedAiField(prev => prev === 'name' ? null : prev)}
              className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
              required
            />
            {focusedAiField === 'name' && (
              <button
                type="button"
                onMouseDown={(e) => openAiPopover(e, 'name')}
                className={`absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${isDark ? 'bg-emerald-700/80 text-emerald-100 hover:bg-emerald-700' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}
                aria-label="Get AI help"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Get AI help
              </button>
            )}
            {aiDropdownOpen && aiAnchorField === 'name' && (
              <div ref={aiPopoverRef} className={`absolute left-0 right-0 mt-1 z-[100] rounded-lg border shadow-lg overflow-hidden ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
                {aiPopoverActions}
              </div>
            )}
          </div>

          {/* Description — floaty when focused */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Description *
              </label>
              <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {formData.description.length}/{DESCRIPTION_MAX_LENGTH}
              </span>
              {formData.description.length > 0 && formData.name?.trim() && (
                <span className="text-green-600" aria-hidden="true">✓</span>
              )}
            </div>
            <textarea
              placeholder="Describe your movement or idea..."
              rows={4}
              maxLength={DESCRIPTION_MAX_LENGTH}
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              onFocus={() => setFocusedAiField('description')}
              onBlur={() => setFocusedAiField(prev => prev === 'description' ? null : prev)}
              className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
              required
            />
            {focusedAiField === 'description' && (
              <button
                type="button"
                onMouseDown={(e) => openAiPopover(e, 'description')}
                className={`absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${isDark ? 'bg-emerald-700/80 text-emerald-100 hover:bg-emerald-700' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}
                aria-label="Get AI help"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Get AI help
              </button>
            )}
            {aiDropdownOpen && aiAnchorField === 'description' && (
              <div ref={aiPopoverRef} className={`absolute left-0 right-0 mt-1 z-[100] rounded-lg border shadow-lg overflow-hidden ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
                {aiPopoverActions}
              </div>
            )}

            {/* Inline result block: below description */}
            {aiResultType && aiResult && (
              <div className={`mt-3 rounded-lg border p-3 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                {aiResultType === 'review' && (
                  <>
                    <p className="text-sm"><strong>Score:</strong> {aiResult.score}/5 — {aiResult.summary}</p>
                    {aiResult.suggestions?.length > 0 && (
                      <ul className="mt-2 list-disc list-inside text-sm space-y-0.5">
                        {aiResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                    <button type="button" onClick={() => { setAiResult(null); setAiResultType(null); }} className={`mt-3 text-sm font-medium ${isDark ? 'text-emerald-400 hover:underline' : 'text-emerald-600 hover:underline'}`}>Dismiss</button>
                  </>
                )}
                {aiResultType === 'suggestions' && aiResult.suggestions?.length > 0 && (
                  <>
                    <p className="text-sm font-medium mb-1">Suggestions</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      {aiResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                    <button type="button" onClick={() => { setAiResult(null); setAiResultType(null); }} className={`mt-3 text-sm font-medium ${isDark ? 'text-emerald-400 hover:underline' : 'text-emerald-600 hover:underline'}`}>Dismiss</button>
                  </>
                )}
                {aiResultType === 'tasks' && aiResult.tasks?.length > 0 && (
                  <>
                    <p className="text-sm font-medium mb-1">Suggested tasks (we&apos;ll add these when you create the idea)</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      {aiResult.tasks.map((t, i) => <li key={i}><strong>{t.title}</strong>{t.description ? ` — ${t.description}` : ''}</li>)}
                    </ul>
                    <button type="button" onClick={() => { setAiResult(null); setAiResultType(null); }} className={`mt-3 text-sm font-medium ${isDark ? 'text-emerald-400 hover:underline' : 'text-emerald-600 hover:underline'}`}>Dismiss</button>
                  </>
                )}
                {aiResultType === 'suggest_tags' && aiResult.tags?.length > 0 && (
                  <>
                    <p className="text-sm font-medium mb-1">Suggested tags</p>
                    <p className="text-sm mb-2">{aiResult.tags.join(', ')}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { handleChange('tags', aiResult.tags.join(', ')); setAiResult(null); setAiResultType(null); }} className={`text-sm font-medium px-3 py-1.5 rounded-lg ${isDark ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>Apply tags</button>
                      <button type="button" onClick={() => { setAiResult(null); setAiResultType(null); }} className={`text-sm font-medium ${isDark ? 'text-emerald-400 hover:underline' : 'text-emerald-600 hover:underline'}`}>Dismiss</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {type === 'movement' ? (
            <div className={`rounded-lg px-4 py-3 ${isDark ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
              <p className="text-sm font-medium">Location</p>
              <p className="text-sm mt-0.5">
                {locationMode === 'search' && selectedLocation
                  ? `${selectedLocation.city}, ${selectedLocation.state}`
                  : locationMode === 'draw' && boundaryCity && boundaryState
                    ? `Boundary: ${boundaryCity}, ${boundaryState}`
                    : '—'}
              </p>
            </div>
          ) : (
            <>
              {initialCoordinates && (
                <div className={`${isDark ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 mb-4`}>
                  <p className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                    <strong>Location:</strong> {reverseGeocodedAddress || `${initialCoordinates.latitude.toFixed(4)}, ${initialCoordinates.longitude.toFixed(4)}`}
                  </p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>Click on the map to change location</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    type="text"
                    placeholder="Address (optional)"
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
                  />
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Funding Goal ($)"
                    value={formData.fundingGoal}
                    onChange={(e) => handleChange('fundingGoal', e.target.value)}
                    className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
                  />
                </div>
              </div>
              
              {/* Image Upload Section */}
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Cover Image (optional)
                  </label>
                  <input
                    ref={coverImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, true)}
                    className="hidden"
                  />
                  {coverImage ? (
                    <div className="relative">
                      <img
                        src={coverImage}
                        alt="Cover preview"
                        className={`w-full h-48 object-cover rounded-lg border ${isDark ? 'border-gray-600' : 'border-gray-300'}`}
                      />
                      <button
                        type="button"
                        onClick={removeCoverImage}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => coverImageInputRef.current?.click()}
                      className={`w-full border-2 border-dashed ${isDark ? 'border-gray-600 hover:border-green-500' : 'border-gray-300 hover:border-green-500'} rounded-lg p-6 transition-colors flex flex-col items-center justify-center gap-2`}
                    >
                      <Upload className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                      <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Click to upload cover image</span>
                    </button>
                  )}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Additional Images (optional)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageUpload(e, false)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full border-2 border-dashed ${isDark ? 'border-gray-600 hover:border-green-500' : 'border-gray-300 hover:border-green-500'} rounded-lg p-4 transition-colors flex items-center justify-center gap-2`}
                  >
                    <ImageIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Add images</span>
                  </button>
                  
                  {images.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      {images.map((image, index) => (
                        <div key={index} className="relative">
                          <img
                            src={image}
                            alt={`Upload ${index + 1}`}
                            className={`w-full h-32 object-cover rounded-lg border ${isDark ? 'border-gray-600' : 'border-gray-300'}`}
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {type === 'movement' && (
            <div className="relative">
              <input
                type="text"
                placeholder="Tags (comma-separated, optional)"
                value={formData.tags}
                onChange={(e) => handleChange('tags', e.target.value)}
                onFocus={() => setFocusedAiField('tags')}
                onBlur={() => setFocusedAiField(prev => prev === 'tags' ? null : prev)}
                className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
              />
              {focusedAiField === 'tags' && (
                <button
                  type="button"
                  onMouseDown={(e) => openAiPopover(e, 'tags')}
                  className={`absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${isDark ? 'bg-emerald-700/80 text-emerald-100 hover:bg-emerald-700' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}
                  aria-label="Get AI help"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Get AI help
                </button>
              )}
              {aiDropdownOpen && aiAnchorField === 'tags' && (
                <div ref={aiPopoverRef} className={`absolute left-0 right-0 mt-1 z-[100] rounded-lg border shadow-lg overflow-hidden ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
                  <div className="p-3 space-y-2">
                    <button type="button" disabled={aiLoading} onClick={() => handleAiAction('suggest_tags')} className={`w-full px-3 py-2 rounded-lg text-sm font-medium text-left ${isDark ? 'bg-emerald-700/50 text-emerald-200 hover:bg-emerald-700' : 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300'} disabled:opacity-50`}>
                      Suggest tags based on title, description & location
                    </button>
                    {aiLoading && <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Thinking...</p>}
                    {aiError && <p className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>{aiError}</p>}
                  </div>
                </div>
              )}
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>e.g., sustainability, climate, food justice</p>
            </div>
          )}
          {error && (
            <div className={`${isDark ? 'bg-red-900 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-700'} border px-4 py-3 rounded-lg text-sm`}>
              {error}
            </div>
          )}
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : `Create ${type === 'movement' ? 'Movement' : 'Idea'}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`flex-1 border ${isDark ? 'border-gray-600 hover:bg-gray-700 text-gray-200' : 'border-gray-300 hover:bg-gray-50'} py-2 rounded-lg disabled:opacity-50`}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateModal;

