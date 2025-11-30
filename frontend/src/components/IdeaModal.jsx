import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapPin, Heart, Share2, Check, Activity, X, MessageSquare, Send, Image as ImageIcon, Upload, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

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
      <div
        className="absolute inset-0 pointer-events-auto"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      />

      <div className="absolute top-[70px] left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col pointer-events-auto">
        <div className="pt-4 pb-4 border-b border-gray-200 flex-shrink-0">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex justify-between items-start">
              <h2 className="text-2xl font-semibold pr-8">{idea.title || 'Untitled Idea'}</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <p className="text-gray-700 mb-6">{idea.description || 'No description'}</p>

            {idea.latitude && idea.longitude && (
              <div className="mb-6">
                <h3 className="font-medium text-sm text-gray-500 mb-2">Location</h3>
                <div
                  ref={ideaMapContainer}
                  className="w-full h-64 rounded-lg overflow-hidden border border-gray-200"
                  style={{ minHeight: '256px' }}
                />
                {idea.address && (
                  <p className="text-sm text-gray-600 mt-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {idea.address}
                  </p>
                )}
              </div>
            )}

            {/* Cover Image */}
            {idea.coverImage && (
              <div className="mb-6">
                <img
                  src={idea.coverImage}
                  alt="Cover"
                  className="w-full h-64 object-cover rounded-lg border border-gray-200"
                />
              </div>
            )}

            {/* Images Gallery */}
            {(images.length > 0 || isCreator) && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-lg">Images</h3>
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
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-4 h-4" />
                        {isUploadingImages ? 'Uploading...' : 'Add Images'}
                      </button>
                    </>
                  )}
                </div>
                {images.length > 0 ? (
                  <div className="grid grid-cols-3 gap-4">
                    {images.map((image, index) => {
                      // Calculate the actual index including cover image
                      const actualIndex = idea.coverImage ? index + 1 : index;
                      return (
                        <div key={index} className="relative group">
                          <img
                            src={image}
                            alt={`Idea image ${index + 1}`}
                            className="w-full h-48 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={(e) => {
                              // Don't open lightbox if clicking the remove button
                              if (e.target.closest('button')) return;
                              const allImages = idea.coverImage ? [idea.coverImage, ...images] : images;
                              setLightboxImageIndex(actualIndex);
                            }}
                          />
                          {isCreator && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeImage(index);
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No images yet</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="font-medium text-sm text-gray-500 mb-1">Creator</h3>
                <p>{idea.creator?.firstName || 'Unknown'} {idea.creator?.lastName || ''}</p>
              </div>
              <div>
                <h3 className="font-medium text-sm text-gray-500 mb-1">Supporters</h3>
                <div className="flex items-center space-x-1">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span>{idea._count?.supporters || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-green-50 p-5 rounded-lg mb-6">
              <h3 className="font-semibold mb-3">Fundraising Progress</h3>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">${((idea.fundingRaised || 0) / 100).toLocaleString()} raised</span>
                <span className="text-gray-600">${((idea.fundingGoal || 0) / 100).toLocaleString()} goal</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                <div
                  className="bg-green-600 h-3 rounded-full transition-all"
                  style={{ width: `${idea.fundingGoal > 0 ? Math.min(((idea.fundingRaised || 0) / idea.fundingGoal) * 100, 100) : 0}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mb-3">{idea._count?.donations || 0} donations • 5% platform fee</p>
              <button className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 font-medium">
                Donate Now
              </button>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold mb-3">Tasks</h3>
              <div className="space-y-2">
                {idea.tasks && idea.tasks.length > 0 ? idea.tasks.map(task => (
                  <div key={task.id} className="flex items-start space-x-3 p-2 hover:bg-gray-50 rounded">
                    <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center ${task.completed ? 'bg-green-600 border-green-600' : 'border-gray-300'}`}>
                      {task.completed && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={task.completed ? 'line-through text-gray-400' : ''}>{task.title}</span>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500">No tasks yet</p>
                )}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold mb-3">Community Needs</h3>
              <div className="space-y-2">
                {idea.needs && idea.needs.length > 0 ? idea.needs.map(need => (
                  <div key={need.id} className="p-3 bg-blue-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium">{need.title}</span>
                      <span className="text-sm text-gray-600">{need.fulfilled}/{need.quantity}</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${need.quantity > 0 ? (need.fulfilled / need.quantity) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500">No needs listed yet</p>
                )}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Activity Feed
              </h3>
              {isLoadingActivities ? (
                <div className="text-center py-4 text-gray-500">Loading activities...</div>
              ) : activities.length > 0 ? (
                <div className="space-y-3">
                  {activities.map((activity, idx) => (
                    <div key={activity.id || idx} className="border-b border-gray-200 pb-3 last:border-0">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          {activity.user?.avatar ? (
                            <img src={activity.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <span className="text-xs font-medium text-gray-600">
                              {activity.user?.firstName?.[0] || ''}{activity.user?.lastName?.[0] || ''}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">{activity.user?.firstName || 'Someone'} {activity.user?.lastName || ''}</span>
                            {' '}
                            {activity.type === 'task_added' && `added task "${activity.task?.title || ''}"`}
                            {activity.type === 'task_claimed' && `claimed task "${activity.task?.title || ''}"`}
                            {activity.type === 'task_updated' && `updated task "${activity.task?.title || ''}"`}
                            {activity.type === 'support' && 'supported this idea'}
                            {activity.type === 'donation' && `donated $${((activity.donation?.amount || 0) / 100).toLocaleString()}`}
                            {activity.type === 'comment' && `commented: "${(activity.comment?.content || '').substring(0, 50)}${activity.comment?.content?.length > 50 ? '...' : ''}"`}
                          </p>
                          <span className="text-xs text-gray-400 mt-1 block">{formatActivityTime(activity.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No activity yet</p>
              )}
            </div>

            <div className="mb-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Comments {comments.length > 0 && `(${comments.length})`}
              </h3>
              
              {/* Comment form */}
              {currentUser ? (
                <form onSubmit={handleSubmitComment} className="mb-4">
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
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      {isSubmittingComment ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-gray-500 mb-4">Sign in to add a comment</p>
              )}

              {/* Comments list */}
              {comments && comments.length > 0 ? (
                <div className="space-y-4">
                  {comments.map(comment => {
                    if (!comment || !comment.id) return null;
                    return (
                      <div key={comment.id} className="border-b border-gray-200 pb-4 last:border-0">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            {comment.user?.avatar ? (
                              <img src={comment.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <span className="text-xs font-medium text-gray-600">
                                {comment.user?.firstName?.[0] || ''}{comment.user?.lastName?.[0] || ''}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {comment.user?.firstName || 'Unknown'} {comment.user?.lastName || ''}
                              </span>
                              <span className="text-xs text-gray-400">
                                {formatCommentTime(comment.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content || ''}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={commentsEndRef} />
                </div>
              ) : (
                <p className="text-sm text-gray-500">No comments yet. Be the first to comment!</p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => onSupport && onSupport(idea.id)}
                className={`flex-1 py-3 rounded-lg flex items-center justify-center space-x-2 ${
                  isSupporting
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Heart className={`w-5 h-5 ${isSupporting ? 'fill-current' : ''}`} />
                <span>{isSupporting ? 'Unsupport' : 'Support'}</span>
              </button>
              <button className="flex-1 border-2 border-gray-300 py-3 rounded-lg hover:bg-gray-50 flex items-center justify-center space-x-2">
                <Share2 className="w-5 h-5" />
                <span>Share</span>
              </button>
            </div>
            {isCreator && (
              <p className="text-xs text-gray-500 text-center mt-2">
                You created this idea{isSupporting ? ' and are supporting it' : ''}
              </p>
            )}
            {isSupporting && (
              <p className="text-xs text-gray-500 text-center mt-2">
                You are supporting this idea
              </p>
            )}
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
    </div>
  );
};

export default IdeaModal;

