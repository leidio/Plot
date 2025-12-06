import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import { X, Image as ImageIcon, Upload } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const CreateModal = ({ type, movement, initialCoordinates, onClose, onSuccess, apiCall }) => {
  const { isDark } = useTheme();
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reverseGeocodedAddress, setReverseGeocodedAddress] = useState('');
  const locationInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const coverImageInputRef = useRef(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (type === 'movement') {
        if (!formData.name || !formData.description || !selectedLocation) {
          setError('Please fill in all required fields and select a location from the suggestions');
          setLoading(false);
          return;
        }

        const tags = formData.tags
          ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
          : [];

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto`}>
        <h2 className={`text-2xl font-bold mb-4 ${isDark ? 'text-gray-100' : ''}`}>
          Create {type === 'movement' ? 'Movement' : 'Idea'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder={type === 'movement' ? 'Movement Name *' : 'Idea Title'}
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
              required
            />
          </div>
          <div>
            <textarea
              placeholder="Description *"
              rows={4}
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
              required
            />
          </div>
          {type === 'movement' ? (
            <div className="relative" ref={locationInputRef}>
              <input
                type="text"
                placeholder="Location (neighborhood, city, state) *"
                value={formData.location}
                onChange={(e) => handleLocationChange(e.target.value)}
                onFocus={() => formData.location && setShowSuggestions(true)}
                className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
                required
                autoComplete="off"
              />
              {showSuggestions && locationSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className={`absolute z-50 w-full mt-1 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'} border rounded-lg shadow-lg max-h-60 overflow-y-auto`}
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
            <div>
              <input
                type="text"
                placeholder="Tags (comma-separated, optional)"
                value={formData.tags}
                onChange={(e) => handleChange('tags', e.target.value)}
                className={`w-full px-4 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
              />
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

