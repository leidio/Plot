import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ChevronUp, Lightbulb, Check, Plus, Sparkles, X } from 'lucide-react';
import { useIdeaMarkers } from './movement-details/useIdeaMarkers';
import { usePresence } from '../hooks/usePresence';
import { useTheme } from '../hooks/useTheme';

const MovementView = ({
  movement,
  ideas,
  currentUser,
  map,
  markersRef,
  socket,
  isConnected,
  setHoveredItem,
  onBack,
  onIdeaSelect,
  onCreateIdea,
  addIdeaMode,
  onMapAreaClick,
  onLocationClick,
  onFollowChange,
  onTagClick,
  apiCall,
  loadIdeas
}) => {
  const { isDark } = useTheme();
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [suggestIdeasLoading, setSuggestIdeasLoading] = useState(false);
  const [suggestIdeasError, setSuggestIdeasError] = useState(null);
  const [suggestedIdeas, setSuggestedIdeas] = useState([]);
  const [suggestedAreaSummary, setSuggestedAreaSummary] = useState('');
  const [addingIdeaId, setAddingIdeaId] = useState(null);
  const headerRef = useRef(null);
  const contentRef = useRef(null);
  const viewers = usePresence({ socket, isConnected, movement, currentUser });

  const handleSuggestIdeas = async () => {
    if (!movement?.id || !currentUser) return;
    setSuggestIdeasError(null);
    setSuggestedIdeas([]);
    setSuggestedAreaSummary('');
    setSuggestIdeasLoading(true);
    try {
      const response = await apiCall('post', '/ai/suggest-ideas', { movementId: movement.id });
      setSuggestedIdeas(response.data.suggestions || []);
      setSuggestedAreaSummary(response.data.areaSummary || '');
    } catch (err) {
      setSuggestIdeasError(err.response?.data?.error?.message || err.message || 'Failed to suggest ideas');
    } finally {
      setSuggestIdeasLoading(false);
    }
  };

  const handleAddSuggestedIdea = async (suggestion, index) => {
    if (!movement?.id || !currentUser || addingIdeaId != null) return;
    setAddingIdeaId(index);
    try {
      await apiCall('post', '/ideas', {
        title: suggestion.title,
        description: suggestion.description,
        movementId: movement.id,
        latitude: movement.latitude,
        longitude: movement.longitude
      });
      if (loadIdeas) await loadIdeas(movement.id);
      setSuggestedIdeas(prev => prev.filter((_, i) => i !== index));
    } catch (err) {
      console.error('Error adding idea:', err);
    } finally {
      setAddingIdeaId(null);
    }
  };

  useEffect(() => {
    if (movement && currentUser && movement.members) {
      const isMember = movement.members.some(
        member => member.userId === currentUser.id || member.user?.id === currentUser.id
      );
      setIsFollowing(isMember);
    } else {
      setIsFollowing(false);
    }
  }, [movement, currentUser]);

  const plottersCount = movement?._count?.members || 0;
  const locationsCount = ideas?.length || 0;
  const raisedAmount = ideas?.reduce((sum, idea) => sum + (idea.fundingRaised || 0), 0) || 0;

  const handleFollowToggle = async () => {
    if (!currentUser || !movement) {
      return;
    }

    setIsLoadingFollow(true);
    try {
      if (isFollowing) {
        await apiCall('delete', `/movements/${movement.id}/leave`);
        setIsFollowing(false);
      } else {
        await apiCall('post', `/movements/${movement.id}/join`);
        setIsFollowing(true);
      }

      if (onFollowChange) {
        onFollowChange(movement.id, !isFollowing);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      setIsFollowing(!isFollowing);
    } finally {
      setIsLoadingFollow(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        const scrollTop = contentRef.current.scrollTop;
        if (scrollTop > 100 && !headerCollapsed) {
          setHeaderCollapsed(true);
        }
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener('scroll', handleScroll);
      return () => content.removeEventListener('scroll', handleScroll);
    }
  }, [headerCollapsed]);

  useIdeaMarkers({
    mapRef: map,
    markersRef,
    movement,
    ideas,
    headerCollapsed,
    onIdeaSelect,
    setHoveredItem
  });

  if (!movement) return null;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="absolute inset-0 flex flex-col pointer-events-none">
      <div
        ref={headerRef}
        className={`pointer-events-auto ${isDark ? 'bg-gray-800' : 'bg-white'} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} transition-all duration-300 ${
          headerCollapsed ? 'py-2' : 'py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={onBack}
                  className={`p-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded-lg`}
                >
                  <ChevronUp className={`w-5 h-5 rotate-[-90deg] ${isDark ? 'text-gray-300' : ''}`} />
                </button>
                <h1 className={`font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'} ${headerCollapsed ? 'text-xl' : 'text-3xl'}`}>
                  {movement.name}
                </h1>
              </div>
              {!headerCollapsed && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => onLocationClick && onLocationClick(movement.city, movement.state)}
                    className={`px-3 py-1 ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} rounded-lg text-sm flex items-center gap-1 cursor-pointer`}
                  >
                    <MapPin className="w-4 h-4" />
                    {movement.city}, {movement.state}
                  </button>
                  {currentUser && (
                    <button
                      onClick={handleFollowToggle}
                      disabled={isLoadingFollow}
                      className={`px-3 py-1 rounded-lg text-sm flex items-center gap-1 transition-colors ${
                        isFollowing
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : isDark
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      } ${isLoadingFollow ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isLoadingFollow ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          {isFollowing ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          {isFollowing ? 'Following' : 'Follow'}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {currentUser && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                  <div className="flex -space-x-2">
                    {(viewers.length > 0 ? viewers : [{
                      userId: currentUser.id,
                      firstName: currentUser.firstName,
                      lastName: currentUser.lastName,
                      avatar: currentUser.avatar
                    }]).slice(0, 3).map((viewer, idx) => {
                      const isCurrentUser = viewer && viewer.userId === currentUser?.id;
                      return (
                        <div
                          key={viewer?.userId || idx}
                          className={`w-8 h-8 rounded-full border-2 ${isDark ? 'border-gray-700' : 'border-white'} flex items-center justify-center text-xs font-medium ${
                            isCurrentUser
                              ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                              : isDark
                              ? 'bg-gray-600 text-gray-300'
                              : 'bg-gray-300 text-gray-700'
                          }`}
                          title={viewer ? `${viewer.firstName} ${viewer.lastName}` : ''}
                        >
                          {viewer?.avatar ? (
                            <img src={viewer.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <span>
                              {viewer?.firstName?.[0] || ''}{viewer?.lastName?.[0] || ''}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {viewers.length > 3 && (
                      <div className={`w-8 h-8 rounded-full border-2 ${isDark ? 'border-gray-700 bg-gray-600 text-gray-300' : 'border-white bg-gray-200 text-gray-700'} flex items-center justify-center text-xs font-medium`}>
                        +{viewers.length - 3}
                      </div>
                    )}
                  </div>
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {viewers.length === 0 || (viewers.length === 1 && viewers[0]?.userId === currentUser?.id)
                      ? 'You are viewing'
                      : `${viewers.length} ${viewers.length === 1 ? 'person is' : 'people are'} viewing`}
                  </span>
                </div>
              )}
              {!headerCollapsed && (
                <div className="flex gap-3">
                  <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg px-4 py-2 text-center min-w-[100px]`}>
                    <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{plottersCount}</div>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Plotters</div>
                  </div>
                  <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg px-4 py-2 text-center min-w-[100px]`}>
                    <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{locationsCount}</div>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Locations</div>
                  </div>
                  <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg px-4 py-2 text-center min-w-[100px]`}>
                    <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>${(raisedAmount / 100).toLocaleString()}</div>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Raised</div>
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  setHeaderCollapsed(!headerCollapsed);
                  if (headerCollapsed && contentRef.current) {
                    contentRef.current.scrollTop = 0;
                  }
                }}
                className={`p-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded-lg`}
              >
                <ChevronUp className={`w-5 h-5 transition-transform ${isDark ? 'text-gray-300' : ''} ${headerCollapsed ? '' : 'rotate-180'}`} />
              </button>
            </div>
          </div>

          {!headerCollapsed && (
            <div className="grid grid-cols-2 gap-8 mt-6">
              <div>
                <h2 className={`font-semibold text-lg mb-3 ${isDark ? 'text-gray-200' : ''}`}>Overview</h2>
                <p className={`leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{movement.description}</p>
              </div>
              <div>
                <h2 className={`font-semibold text-lg mb-3 ${isDark ? 'text-gray-200' : ''}`}>Details</h2>
                <div className={`space-y-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  <div>
                    <span className="font-medium">Launched:</span> {formatDate(movement.createdAt)}
                  </div>
                  <div>
                    <span className="font-medium">Manager:</span> {movement.owner?.firstName} {movement.owner?.lastName}
                  </div>
                </div>
                {movement.tags && movement.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {movement.tags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => onTagClick && onTagClick(tag)}
                        className={`px-3 py-1 ${isDark ? 'bg-blue-900 text-blue-200 hover:bg-blue-800' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'} rounded-lg text-sm cursor-pointer transition-colors`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!headerCollapsed && currentUser && (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={onCreateIdea}
                  className={`${isDark ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-200' : 'bg-white border-gray-300 hover:bg-gray-50'} border-2 px-6 py-3 rounded-lg flex items-center gap-2 font-medium`}
                >
                  <Lightbulb className="w-5 h-5" />
                  Add an idea
                </button>
                <button
                  onClick={handleSuggestIdeas}
                  disabled={suggestIdeasLoading}
                  className={`${isDark ? 'bg-emerald-700 border-emerald-600 hover:bg-emerald-600 text-white' : 'bg-emerald-500 border-emerald-600 hover:bg-emerald-600 text-white'} border-2 px-6 py-3 rounded-lg flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {suggestIdeasLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Analyzing area…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Suggest ideas with AI
                    </>
                  )}
                </button>
              </div>
              {suggestIdeasError && (
                <p className={`text-center text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  {suggestIdeasError}
                </p>
              )}
              {suggestedIdeas.length > 0 && (
                <div className={`rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                      AI-suggested ideas
                    </h3>
                    <button
                      type="button"
                      onClick={() => { setSuggestedIdeas([]); setSuggestedAreaSummary(''); }}
                      className={`p-1 rounded ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                      aria-label="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {suggestedAreaSummary && (
                    <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${isDark ? 'bg-gray-700/50 text-gray-300' : 'bg-white border border-gray-200 text-gray-700'}`}>
                      <p className="font-medium mb-1">Area summary</p>
                      <p className="leading-relaxed">{suggestedAreaSummary}</p>
                    </div>
                  )}
                  <ul className="space-y-3 max-h-64 overflow-y-auto">
                    {suggestedIdeas.map((suggestion, index) => (
                      <li
                        key={index}
                        className={`rounded-lg border p-3 ${isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-white border-gray-200'}`}
                      >
                        <p className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                          {suggestion.title}
                        </p>
                        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'} line-clamp-2`}>
                          {suggestion.description}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleAddSuggestedIdea(suggestion, index)}
                          disabled={addingIdeaId !== null}
                          className="mt-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                        >
                          {addingIdeaId === index ? 'Adding…' : 'Add as idea'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={contentRef} className="flex-1 relative pointer-events-none overflow-auto bg-transparent">
        {addIdeaMode && onMapAreaClick && (
          <div
            className="absolute inset-0 cursor-crosshair z-[1]"
            style={{ pointerEvents: 'auto' }}
            onClick={onMapAreaClick}
            aria-label="Click map to add idea"
          />
        )}
        {addIdeaMode && currentUser && (
          <div className={`pointer-events-auto absolute top-4 left-1/2 transform -translate-x-1/2 ${isDark ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 z-10`}>
            <p className={`text-sm font-medium mb-1 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
              💡 Add Idea Mode Active
            </p>
            <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
              Click anywhere on the map to place your idea at that location
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovementView;

