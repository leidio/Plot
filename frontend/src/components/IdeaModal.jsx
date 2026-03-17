import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapPin, Heart, Share2, Check, Activity, X, MessageSquare, Send, Image as ImageIcon, Upload, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import CoPilot from './CoPilot';

const IdeaModal = ({ idea, onClose, currentUser, onSupport, socket, isConnected, apiCall, onIdeaUpdate }) => {
  const ideaMapContainer = useRef(null);
  const ideaMap = useRef(null);
  const ideaMarkerRef = useRef(null);
  const [activities, setActivities] = useState([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [images, setImages] = useState([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(null);
  const commentsEndRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    if (!idea || !idea.latitude || !idea.longitude) return;

    if (!ideaMap.current && ideaMapContainer.current) {
      ideaMap.current = new mapboxgl.Map({
        container: ideaMapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [idea.longitude, idea.latitude],
        zoom: 16,
        interactive: true
      });

      ideaMap.current.on('load', () => {
        ideaMap.current.addControl(new mapboxgl.NavigationControl(), 'bottom-left');

        const el = document.createElement('div');
        el.style.cssText = `
          background-color: #2563eb;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        `;
        el.innerHTML = '💡';

        ideaMarkerRef.current = new mapboxgl.Marker({
          element: el,
          anchor: 'center'
        })
          .setLngLat([idea.longitude, idea.latitude])
          .addTo(ideaMap.current);

        setTimeout(() => {
          if (ideaMap.current) {
            ideaMap.current.resize();
          }
        }, 100);
      });
    } else if (ideaMap.current && idea.longitude && idea.latitude) {
      ideaMap.current.flyTo({
        center: [idea.longitude, idea.latitude],
        zoom: 16,
        duration: 500
      });

      if (ideaMarkerRef.current) {
        ideaMarkerRef.current.setLngLat([idea.longitude, idea.latitude]);
      }
    }

    return () => {
      if (ideaMarkerRef.current) {
        ideaMarkerRef.current.remove();
        ideaMarkerRef.current = null;
      }
      if (ideaMap.current) {
        ideaMap.current.remove();
        ideaMap.current = null;
      }
    };
  }, [idea]);

  useEffect(() => {
    if (!idea?.id) return;

    const fetchActivities = async () => {
      setIsLoadingActivities(true);
      try {
        const response = await apiCall('get', `/ideas/${idea.id}/activities`);
        setActivities(response.data.activities || []);
      } catch (error) {
        console.error('Error fetching activities:', error);
        setActivities([]);
      } finally {
        setIsLoadingActivities(false);
      }
    };

    fetchActivities();
  }, [idea?.id, apiCall]);

  // Initialize comments from idea prop
  useEffect(() => {
    if (idea?.comments) {
      setComments(idea.comments);
    } else {
      setComments([]);
    }
  }, [idea?.id, idea?.comments]);

  // Initialize images from idea prop
  useEffect(() => {
    if (idea?.images) {
      setImages(idea.images);
    } else {
      setImages([]);
    }
  }, [idea?.id, idea?.images]);

  useEffect(() => {
    if (!socket || !isConnected || !idea?.id) return;

    const handleActivityUpdate = (data) => {
      if (data.ideaId === idea.id) {
        setActivities(prev => [data.activity, ...prev].slice(0, 50));
        
        // If it's a comment activity, add it to comments
        // The activity contains the comment data directly
        if (data.activity?.type === 'comment' && data.activity.id) {
          const comment = {
            id: data.activity.id,
            content: data.activity.content,
            createdAt: data.activity.createdAt,
            user: data.activity.user
          };
          setComments(prev => {
            // Check if comment already exists to avoid duplicates
            if (prev.some(c => c.id === comment.id)) {
              return prev;
            }
            // Add to the beginning since comments are ordered by createdAt desc
            return [comment, ...prev];
          });
        }
      }
    };

    socket.on('idea:activity', handleActivityUpdate);

    return () => {
      socket.off('idea:activity', handleActivityUpdate);
    };
  }, [socket, isConnected, idea?.id]);

  // Scroll to bottom when new comment is added
  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments.length]);

  const formatCommentTime = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    } catch (error) {
      return '';
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || isSubmittingComment || !idea?.id) return;

    setIsSubmittingComment(true);
    try {
      const response = await apiCall('post', `/ideas/${idea.id}/comments`, {
        content: newComment.trim()
      });

      // Add the new comment to the list
      if (response.data?.comment) {
        setComments(prev => [response.data.comment, ...prev]);
        setNewComment('');
      }
    } catch (error) {
      console.error('Error submitting comment:', error);
      // You could add error handling/toast notification here
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Limit file size to 10MB
    const maxSize = 10 * 1024 * 1024;
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        alert(`File ${file.name} is too large. Maximum size is 10MB.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsUploadingImages(true);
    try {
      const base64Images = await Promise.all(validFiles.map(convertToBase64));
      const newImages = [...images, ...base64Images];
      
      // Update idea with new images
      const response = await apiCall('patch', `/ideas/${idea.id}`, {
        images: newImages
      });

      if (response.data?.idea) {
        setImages(newImages);
        // Notify parent component of update
        if (onIdeaUpdate) {
          onIdeaUpdate(response.data.idea);
        }
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      alert('Failed to upload images. Please try again.');
    } finally {
      setIsUploadingImages(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  const removeImage = async (index) => {
    const newImages = images.filter((_, i) => i !== index);
    
    try {
      const response = await apiCall('patch', `/ideas/${idea.id}`, {
        images: newImages
      });

      if (response.data?.idea) {
        setImages(newImages);
        // Notify parent component of update
        if (onIdeaUpdate) {
          onIdeaUpdate(response.data.idea);
        }
      }
    } catch (error) {
      console.error('Error removing image:', error);
      alert('Failed to remove image. Please try again.');
    }
  };

  if (!idea) {
    return null;
  }

  const isSupporting = idea.isSupporting || false;
  const isCreator = currentUser && idea.creator && (idea.creator.id === currentUser.id);

  const formatActivityTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Scrim over map */}
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={onClose}
      />

      {/* Idea page aligned under header, fills map height */}
      <div className="absolute top-[70px] left-0 right-0 bottom-0 flex justify-center pointer-events-none">
        <div className="relative w-full max-w-5xl bg-white rounded-t-2xl shadow-2xl flex flex-col pointer-events-auto mx-4 md:mx-12 lg:mx-24">
          <div className="pt-4 pb-4 border-b border-gray-200 flex-shrink-0">
            <div className="max-w-7xl mx-auto px-6 flex justify-between items-start">
              <h2 className="text-2xl font-semibold pr-8">{idea.title || 'Untitled Idea'}</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
              {/* Top hero: map + gallery */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1.6fr)] gap-6">
                {/* Map */}
                {idea.latitude && idea.longitude && (
                  <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                    <div
                      ref={ideaMapContainer}
                      className="w-full h-64 md:h-72"
                    />
                    {idea.address && (
                      <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>{idea.address}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Images / gallery */}
                <div className="space-y-3">
                  {idea.coverImage && (
                    <div className="rounded-2xl overflow-hidden border border-gray-200">
                      <img
                        src={idea.coverImage}
                        alt="Cover"
                        className="w-full h-64 md:h-72 object-cover"
                      />
                    </div>
                  )}

                  {(images.length > 0 || isCreator) && (
                    <div className="ui-card p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-sm text-gray-900">Images</h3>
                        {isCreator && (
                          <>
                            <input
                              ref={imageInputRef}
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleImageUpload}
                              className="hidden"
                              disabled={isUploadingImages}
                            />
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              disabled={isUploadingImages}
                              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-4 h-4" />
                              {isUploadingImages ? 'Uploading…' : 'Add images'}
                            </button>
                          </>
                        )}
                      </div>
                      {images.length > 0 ? (
                        <div className="grid grid-cols-3 gap-3">
                          {images.slice(0, 6).map((image, index) => {
                            const actualIndex = idea.coverImage ? index + 1 : index;
                            return (
                              <button
                                key={index}
                                type="button"
                                onClick={() => setLightboxImageIndex(actualIndex)}
                                className="relative group rounded-lg overflow-hidden border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <img
                                  src={image}
                                  alt={`Idea image ${index + 1}`}
                                  className="w-full h-24 object-cover group-hover:scale-[1.02] transition-transform"
                                />
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No images yet</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Main content + sidebar */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)] gap-8 items-start">
                {/* Left: overview + comments (Discussion tab) */}
                <div className="space-y-6">
                  {/* Meta */}
                  <div className="space-y-2">
                    <p className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                      {idea.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          {idea.location}
                        </span>
                      )}
                      {idea.createdAt && (
                        <span>Created {new Date(idea.createdAt).toLocaleDateString()}</span>
                      )}
                      {idea.creator && (
                        <span>by {idea.creator.firstName} {idea.creator.lastName}</span>
                      )}
                    </p>
                    <p className="text-gray-700">
                      {idea.description || 'No description yet.'}
                    </p>
                  </div>

                  {/* Simple tab strip (only Discussion active for now) */}
                  <div className="flex items-center gap-2 text-sm">
                    <button className="px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs font-medium">
                      Discussion
                    </button>
                    <button className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium cursor-default">
                      Tasks
                    </button>
                    <button className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium cursor-default">
                      Resources
                    </button>
                  </div>

                  {/* Comments (discussion) */}
                  <div className="space-y-4">
                    {currentUser ? (
                      <form onSubmit={handleSubmitComment} className="mb-2">
                        <div className="flex gap-2">
                          <textarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment..."
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            rows={3}
                            disabled={isSubmittingComment}
                          />
                          <button
                            type="submit"
                            disabled={!newComment.trim() || isSubmittingComment}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                          >
                            <Send className="w-4 h-4" />
                            {isSubmittingComment ? 'Posting…' : 'Post'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-sm text-gray-500 mb-2">Sign in to add a comment.</p>
                    )}

                    {comments && comments.length > 0 ? (
                      <div className="space-y-4">
                        {comments.map((comment) => {
                          if (!comment || !comment.id) return null;
                          return (
                            <div key={comment.id} className="border-b border-gray-200 pb-4 last:border-0">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                  {comment.user?.avatar ? (
                                    <img
                                      src={comment.user.avatar}
                                      alt=""
                                      className="w-full h-full rounded-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-xs font-medium text-gray-600">
                                      {comment.user?.firstName?.[0] || ''}
                                      {comment.user?.lastName?.[0] || ''}
                                    </span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-sm">
                                      {comment.user?.firstName || 'Unknown'}{' '}
                                      {comment.user?.lastName || ''}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                      {formatCommentTime(comment.createdAt)}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                    {comment.content || ''}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={commentsEndRef} />
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        No comments yet. Be the first to comment!
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: sidebar summary / actions */}
                <div className="space-y-4">
                  {/* Funding summary */}
                    <div className="ui-card-muted p-4">
                    <div className="flex items-baseline justify-between mb-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Raised
                        </p>
                        <p className="text-xl font-semibold text-gray-900">
                          ${((idea.fundingRaised || 0) / 100).toLocaleString()}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500">
                        Goal ${((idea.fundingGoal || 0) / 100).toLocaleString()}
                      </p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${
                            idea.fundingGoal > 0
                              ? Math.min(
                                  ((idea.fundingRaised || 0) / idea.fundingGoal) * 100,
                                  100
                                )
                              : 0
                          }%`
                        }}
                      />
                    </div>
                    <button className="w-full bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 text-sm font-medium">
                      Contribute
                    </button>
                  </div>

                  {/* Support / share */}
                  <div className="ui-card p-4 space-y-3">
                    <button
                      onClick={() => onSupport && onSupport(idea.id)}
                      className={`w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium ${
                        isSupporting
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isSupporting ? 'fill-current' : ''}`} />
                      <span>{isSupporting ? 'Unsupport' : 'Support this idea'}</span>
                    </button>
                    <button className="w-full border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 text-sm">
                      <Share2 className="w-4 h-4" />
                      <span>Share</span>
                    </button>
                    {isCreator && (
                      <p className="text-[11px] text-gray-500 text-center">
                        You created this idea{isSupporting ? ' and are supporting it' : ''}.
                      </p>
                    )}
                  </div>

                  {/* Tags / collections (simple placeholders) */}
                  {idea.tags && idea.tags.length > 0 && (
                    <div className="ui-card p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Tags
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {idea.tags.map((tag) => (
                          <span
                            key={tag}
                            className="ui-tag-pill"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxImageIndex !== null && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-90"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxImageIndex(null);
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxImageIndex(null);
            }}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
          >
            <X className="w-8 h-8" />
          </button>

          {(() => {
            const allImages = idea.coverImage ? [idea.coverImage, ...images] : images;
            const currentImage = allImages[lightboxImageIndex];
            const hasPrev = lightboxImageIndex > 0;
            const hasNext = lightboxImageIndex < allImages.length - 1;

            return (
              <>
                {hasPrev && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxImageIndex(lightboxImageIndex - 1);
                    }}
                    className="absolute left-4 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2"
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </button>
                )}

                <img
                  src={currentImage}
                  alt={`Image ${lightboxImageIndex + 1} of ${allImages.length}`}
                  className="max-w-[90vw] max-h-[90vh] object-contain"
                  onClick={(e) => e.stopPropagation()}
                />

                {hasNext && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxImageIndex(lightboxImageIndex + 1);
                    }}
                    className="absolute right-4 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2"
                  >
                    <ChevronRight className="w-8 h-8" />
                  </button>
                )}

                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm">
                  {lightboxImageIndex + 1} / {allImages.length}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {currentUser && idea?.creatorId === currentUser.id && idea?.movementId && apiCall && (
        <CoPilot
          movementId={idea.movementId}
          ideaId={idea.id}
          movementName={idea.movement?.name || idea.title}
          apiCall={apiCall}
        />
      )}
    </div>
  );
};

export default IdeaModal;

