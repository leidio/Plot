import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapPin, Heart, Share2, Check, Activity, X } from 'lucide-react';

const IdeaModal = ({ idea, onClose, currentUser, onSupport, socket, isConnected, apiCall }) => {
  const ideaMapContainer = useRef(null);
  const ideaMap = useRef(null);
  const ideaMarkerRef = useRef(null);
  const [activities, setActivities] = useState([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

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

  useEffect(() => {
    if (!socket || !isConnected || !idea?.id) return;

    const handleActivityUpdate = (data) => {
      if (data.ideaId === idea.id) {
        setActivities(prev => [data.activity, ...prev].slice(0, 50));
      }
    };

    socket.on('idea:activity', handleActivityUpdate);

    return () => {
      socket.off('idea:activity', handleActivityUpdate);
    };
  }, [socket, isConnected, idea?.id]);

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

            {idea.comments && idea.comments.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold mb-3">Comments</h3>
                <div className="space-y-3">
                  {idea.comments.map(comment => (
                    <div key={comment.id} className="border-b border-gray-200 pb-3">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-sm">{comment.user?.firstName || 'Unknown'} {comment.user?.lastName || ''}</span>
                        <span className="text-xs text-gray-400">{comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ''}</span>
                      </div>
                      <p className="text-sm text-gray-700">{comment.content || ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
    </div>
  );
};

export default IdeaModal;

