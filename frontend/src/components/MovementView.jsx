import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ChevronUp, Lightbulb, Check, Plus } from 'lucide-react';
import { useIdeaMarkers } from './movement-details/useIdeaMarkers';

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
  apiCall
}) => {
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [viewers, setViewers] = useState([]);
  const headerRef = useRef(null);
  const contentRef = useRef(null);

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
        className={`pointer-events-auto bg-white border-b border-gray-200 transition-all duration-300 ${
          headerCollapsed ? 'py-2' : 'py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={onBack}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronUp className="w-5 h-5 rotate-[-90deg]" />
                </button>
                <h1 className={`font-bold text-gray-900 ${headerCollapsed ? 'text-xl' : 'text-3xl'}`}>
                  {movement.name}
                </h1>
              </div>
              {!headerCollapsed && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => onLocationClick && onLocationClick(movement.city, movement.state)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm flex items-center gap-1 hover:bg-gray-200 cursor-pointer"
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
                          className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium ${
                            isCurrentUser
                              ? 'bg-blue-500 text-white ring-2 ring-blue-300'
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
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-700">
                        +{viewers.length - 3}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-gray-600">
                    {viewers.length === 0 || (viewers.length === 1 && viewers[0]?.userId === currentUser?.id)
                      ? 'You are viewing'
                      : `${viewers.length} ${viewers.length === 1 ? 'person is' : 'people are'} viewing`}
                  </span>
                </div>
              )}
              {!headerCollapsed && (
                <div className="flex gap-3">
                  <div className="bg-gray-50 rounded-lg px-4 py-2 text-center min-w-[100px]">
                    <div className="text-2xl font-bold text-gray-900">{plottersCount}</div>
                    <div className="text-xs text-gray-600">Plotters</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-4 py-2 text-center min-w-[100px]">
                    <div className="text-2xl font-bold text-gray-900">{locationsCount}</div>
                    <div className="text-xs text-gray-600">Locations</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-4 py-2 text-center min-w-[100px]">
                    <div className="text-2xl font-bold text-gray-900">${(raisedAmount / 100).toLocaleString()}</div>
                    <div className="text-xs text-gray-600">Raised</div>
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
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronUp className={`w-5 h-5 transition-transform ${headerCollapsed ? '' : 'rotate-180'}`} />
              </button>
            </div>
          </div>

          {!headerCollapsed && (
            <div className="grid grid-cols-2 gap-8 mt-6">
              <div>
                <h2 className="font-semibold text-lg mb-3">Overview</h2>
                <p className="text-gray-700 leading-relaxed">{movement.description}</p>
              </div>
              <div>
                <h2 className="font-semibold text-lg mb-3">Details</h2>
                <div className="space-y-2 text-gray-700">
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
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 cursor-pointer transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!headerCollapsed && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={onCreateIdea}
                className="bg-white border-2 border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-2 font-medium"
              >
                <Lightbulb className="w-5 h-5" />
                Add an idea
              </button>
            </div>
          )}
        </div>
      </div>

      <div ref={contentRef} className="flex-1 relative pointer-events-none overflow-auto">
        {addIdeaMode && currentUser && (
          <div className="pointer-events-auto absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-50 border border-blue-200 rounded-lg p-3 z-10">
            <p className="text-sm text-blue-800 font-medium mb-1">
              💡 Add Idea Mode Active
            </p>
            <p className="text-xs text-blue-700">
              Click anywhere on the map to place your idea at that location
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovementView;

