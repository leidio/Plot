import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ChevronUp, Lightbulb, Check, Plus, Sparkles, X } from 'lucide-react';
import { useIdeaMarkers } from './movement-details/useIdeaMarkers';
import { usePresence } from '../hooks/usePresence';
import { useTheme } from '../hooks/useTheme';
import CoPilot from './CoPilot';

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
  onLocationClick,
  onFollowChange,
  onTagClick,
  apiCall,
  loadIdeas,
  isIdeaOpen = false
}) => {
  const { isDark } = useTheme();
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [suggestIdeasLoading, setSuggestIdeasLoading] = useState(false);
  const [suggestIdeasError, setSuggestIdeasError] = useState(null);
  const [suggestedIdeas, setSuggestedIdeas] = useState([]);
  const [suggestedAreaSummary, setSuggestedAreaSummary] = useState('');
  const [addingIdeaId, setAddingIdeaId] = useState(null);
  const contentRef = useRef(null);
  const ideasListRef = useRef(null);
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
  const ideasCount = ideas?.length || 0;
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

  useIdeaMarkers({
    mapRef: map,
    markersRef,
    movement,
    ideas,
    headerCollapsed: true,
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
    <div className="absolute inset-0 pointer-events-none">
      {addIdeaMode && currentUser && (
        <div
          className={`pointer-events-auto absolute top-4 left-1/2 transform -translate-x-1/2 ${
            isDark ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'
          } border rounded-lg p-3 z-10`}
        >
          <p className={`text-sm font-medium mb-1 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
            💡 Add Idea Mode Active
          </p>
          <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
            Click anywhere on the map to place your idea at that location
          </p>
        </div>
      )}

      {/* Collapsed movement panel pill */}
      {panelCollapsed ? (
        <button
          type="button"
          onClick={() => setPanelCollapsed(false)}
          className="ui-panel-pill pointer-events-auto"
          aria-label="Expand movement details"
        >
          <ChevronUp className="w-4 h-4 rotate-90" />
          <span className="truncate max-w-[180px]">{movement.name}</span>
        </button>
      ) : !isIdeaOpen ? (
        <div className="ui-panel pointer-events-auto">
          {/* Panel header */}
          <div className="ui-panel-header">
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={onBack}
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
                  isDark
                    ? 'bg-gray-900/70 text-gray-100 hover:bg-gray-800'
                    : 'bg-white/80 text-gray-800 hover:bg-white'
                }`}
              >
                <ChevronUp className="w-4 h-4 rotate-[-90deg]" />
                <span>Explore movements</span>
              </button>
              <h1
                className={`mt-3 font-semibold tracking-tight text-xl truncate ${
                  isDark ? 'text-gray-100' : 'text-gray-900'
                }`}
              >
                {movement.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onLocationClick && onLocationClick(movement.city, movement.state)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                    isDark
                      ? 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  {movement.city}, {movement.state}
                </button>
                {currentUser && (
                  <button
                    onClick={handleFollowToggle}
                    disabled={isLoadingFollow}
                    className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 font-medium transition-colors ${
                      isFollowing
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : isDark
                        ? 'bg-gray-800 text-gray-200 hover:bg-gray-700'
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
            </div>
            <div className="flex flex-col items-end gap-3">
              {currentUser && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                    isDark ? 'bg-gray-800/80' : 'bg-gray-100/90'
                  }`}
                >
                  <div className="flex -space-x-2">
                    {(viewers.length > 0
                      ? viewers
                      : [
                          {
                            userId: currentUser.id,
                            firstName: currentUser.firstName,
                            lastName: currentUser.lastName,
                            avatar: currentUser.avatar
                          }
                        ]
                    )
                      .slice(0, 3)
                      .map((viewer, idx) => {
                        const isCurrentUser = viewer && viewer.userId === currentUser?.id;
                        return (
                          <div
                            key={viewer?.userId || idx}
                            className={`w-7 h-7 rounded-full border-2 ${
                              isDark ? 'border-gray-900' : 'border-white'
                            } flex items-center justify-center text-[10px] font-medium ${
                              isCurrentUser
                                ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                                : isDark
                                ? 'bg-gray-600 text-gray-300'
                                : 'bg-gray-300 text-gray-700'
                            }`}
                            title={viewer ? `${viewer.firstName} ${viewer.lastName}` : ''}
                          >
                            {viewer?.avatar ? (
                              <img
                                src={viewer.avatar}
                                alt=""
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <span>
                                {viewer?.firstName?.[0] || ''}
                                {viewer?.lastName?.[0] || ''}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    {viewers.length > 3 && (
                      <div
                        className={`w-7 h-7 rounded-full border-2 ${
                          isDark
                            ? 'border-gray-900 bg-gray-600 text-gray-300'
                            : 'border-white bg-gray-200 text-gray-700'
                        } flex items-center justify-center text-[10px] font-medium`}
                      >
                        +{viewers.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setPanelCollapsed(true)}
                className={`p-1.5 rounded-full border ${
                  isDark
                    ? 'border-white/15 bg-gray-900/60 text-gray-200 hover:bg-gray-800'
                    : 'border-white/70 bg-white/80 text-gray-700 hover:bg-white'
                }`}
                aria-label="Collapse movement panel"
              >
                <ChevronUp className="w-4 h-4 rotate-90" />
              </button>
            </div>
          </div>

          {/* Hero image */}
          <div className="ui-card p-0 overflow-hidden mb-3">
            {movement.coverImage ? (
              <img
                src={movement.coverImage}
                alt={movement.name}
                className="w-full h-36 md:h-44 object-cover"
              />
            ) : (
              <div
                className={`h-24 md:h-28 flex items-center justify-center text-xs font-medium ${
                  isDark
                    ? 'bg-gray-900/70 text-gray-500'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                Hero image placeholder
              </div>
            )}
          </div>

          {/* Panel body */}
          <div ref={contentRef} className="ui-panel-body-scroll">
            <div className="grid grid-cols-3 gap-2">
              <div className="ui-stat-tile">
                <div className="ui-stat-tile-value">
                  {plottersCount}
                </div>
                <div className="ui-stat-tile-label">
                  Plotters
                </div>
              </div>
              <button
                type="button"
                className="ui-stat-tile-link text-left"
                onClick={() => {
                  if (ideasListRef.current && contentRef.current) {
                    const container = contentRef.current;
                    const targetTop = ideasListRef.current.offsetTop;
                    container.scrollTo({
                      top: targetTop - 16,
                      behavior: 'smooth'
                    });
                  }
                }}
              >
                <div className="ui-stat-tile-value">
                  {ideasCount}
                </div>
                <div className="ui-stat-tile-label">
                  Ideas
                </div>
              </button>
              <div className="ui-stat-tile">
                <div className="ui-stat-tile-value">
                  ${(raisedAmount / 100).toLocaleString()}
                </div>
                <div className="ui-stat-tile-label">
                  Raised
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="ui-card p-3">
                <h2
                  className={`font-semibold text-sm mb-1 ${
                    isDark ? 'text-gray-200' : 'text-gray-900'
                  }`}
                >
                  Overview
                </h2>
                <p
                  className={`text-sm leading-relaxed ${
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  {movement.description}
                </p>
              </div>
              <div className="ui-card p-3">
                <h2
                  className={`font-semibold text-sm mb-1 ${
                    isDark ? 'text-gray-200' : 'text-gray-900'
                  }`}
                >
                  Details
                </h2>
                <div
                  className={`space-y-1.5 text-xs ${
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  <div>
                    <span className="font-medium">Launched:</span>{' '}
                    {formatDate(movement.createdAt)}
                  </div>
                  <div>
                    <span className="font-medium">Manager:</span>{' '}
                    {movement.owner?.firstName} {movement.owner?.lastName}
                  </div>
                </div>
                {movement.tags && movement.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {movement.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => onTagClick && onTagClick(tag)}
                        className="ui-tag-pill cursor-pointer"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ideas list */}
            {ideas && ideas.length > 0 && (
              <div ref={ideasListRef} className="ui-card p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h2
                    className={`font-semibold text-sm ${
                      isDark ? 'text-gray-200' : 'text-gray-900'
                    }`}
                  >
                    Ideas
                  </h2>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>Newest</span>
                    <span>•</span>
                    <span>Fundraising</span>
                  </div>
                </div>
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {ideas.map((idea) => (
                    <li
                      key={idea.id}
                      className="rounded-xl border border-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-900/80 dark:border-gray-700 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                      onClick={() => onIdeaSelect && onIdeaSelect(idea)}
                    >
                      <div className="flex gap-3 p-3">
                        {idea.coverImage && (
                          <img
                            src={idea.coverImage}
                            alt={idea.title}
                            className="w-20 h-16 rounded-lg object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isDark ? 'text-gray-100' : 'text-gray-900'
                            }`}
                          >
                            {idea.title}
                          </p>
                          <p
                            className={`text-xs mt-0.5 line-clamp-2 ${
                              isDark ? 'text-gray-400' : 'text-gray-600'
                            }`}
                          >
                            {idea.description}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                            <span>
                              {(idea._count?.supporters || 0).toLocaleString()} supporters
                            </span>
                            <span>
                              ${((idea.fundingRaised || 0) / 100).toLocaleString()} raised
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {currentUser && (
              <div className="space-y-3">
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={handleSuggestIdeas}
                    disabled={suggestIdeasLoading}
                    className="ui-button-primary"
                  >
                    {suggestIdeasLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Analyzing area…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Suggest ideas with AI
                      </>
                    )}
                  </button>
                  <button
                    onClick={onCreateIdea}
                    className="ui-button-secondary"
                  >
                    <Lightbulb className="w-4 h-4" />
                    Add an idea
                  </button>
                </div>
                {suggestIdeasError && (
                  <p
                    className={`text-center text-xs ${
                      isDark ? 'text-red-400' : 'text-red-600'
                    }`}
                  >
                    {suggestIdeasError}
                  </p>
                )}
                {suggestedIdeas.length > 0 && (
                  <div
                    className={`rounded-xl border p-3 ${
                      isDark ? 'bg-gray-900/70 border-gray-700' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3
                        className={`font-semibold text-sm ${
                          isDark ? 'text-gray-100' : 'text-gray-900'
                        }`}
                      >
                        AI-suggested ideas
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setSuggestedIdeas([]);
                          setSuggestedAreaSummary('');
                        }}
                        className={`p-1 rounded ${
                          isDark
                            ? 'hover:bg-gray-800 text-gray-400'
                            : 'hover:bg-gray-200 text-gray-500'
                        }`}
                        aria-label="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {suggestedAreaSummary && (
                      <div
                        className={`mb-3 rounded-lg px-3 py-2 text-xs ${
                          isDark
                            ? 'bg-gray-800/80 text-gray-300'
                            : 'bg-white border border-gray-200 text-gray-700'
                        }`}
                      >
                        <p className="font-medium mb-1">Area summary</p>
                        <p className="leading-relaxed">{suggestedAreaSummary}</p>
                      </div>
                    )}
                    <ul className="space-y-2 max-h-60 overflow-y-auto">
                      {suggestedIdeas.map((suggestion, index) => (
                        <li
                          key={index}
                          className={`rounded-lg border p-2.5 ${
                            isDark
                              ? 'bg-gray-900/70 border-gray-700'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <p
                            className={`font-medium text-sm ${
                              isDark ? 'text-gray-100' : 'text-gray-900'
                            }`}
                          >
                            {suggestion.title}
                          </p>
                          <p
                            className={`text-xs mt-0.5 ${
                              isDark ? 'text-gray-400' : 'text-gray-600'
                            } line-clamp-2`}
                          >
                            {suggestion.description}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleAddSuggestedIdea(suggestion, index)}
                            disabled={addingIdeaId !== null}
                            className="mt-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
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
      ) : null}

      {currentUser && movement?.ownerId === currentUser.id && apiCall && !isIdeaOpen && (
        <CoPilot movementId={movement.id} movementName={movement.name} apiCall={apiCall} />
      )}
    </div>
  );
};

export default MovementView;

