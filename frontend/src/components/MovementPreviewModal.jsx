import React from 'react';
import { MapPin, X } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const MovementPreviewModal = ({ movement, onClose, onViewFullPage }) => {
  const { isDark } = useTheme();
  
  if (!movement) {
    return null;
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className={`text-2xl font-semibold pr-8 ${isDark ? 'text-gray-100' : ''}`}>{movement.name || 'Untitled Movement'}</h2>
            <button onClick={onClose} className={isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
              <X className="w-6 h-6" />
            </button>
          </div>

          <p className={`mb-6 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{movement.description || 'No description'}</p>

          <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} p-4 rounded-lg mb-6 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'} space-y-2`}>
            <div className="flex items-center space-x-2">
              <MapPin className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
              <span className="font-medium">Location</span>
            </div>
            <p className={`ml-6 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{movement.city}, {movement.state}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} p-4 rounded-lg text-center`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{movement._count?.members || 0}</div>
              <div className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Members</div>
            </div>
            <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} p-4 rounded-lg text-center`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{movement._count?.ideas || 0}</div>
              <div className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Ideas</div>
            </div>
            <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} p-4 rounded-lg text-center`}>
              <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{formatDate(movement.createdAt)}</div>
              <div className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Launched</div>
            </div>
          </div>

          {movement.owner && (
            <div className="mb-6">
              <h3 className={`font-medium text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Manager</h3>
              <p className={isDark ? 'text-gray-200' : 'text-gray-900'}>
                {movement.owner.firstName || 'Unknown'} {movement.owner.lastName || ''}
              </p>
            </div>
          )}

          {movement.tags && movement.tags.length > 0 && (
            <div className="mb-6">
              <h3 className={`font-medium text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Tags</h3>
              <div className="flex flex-wrap gap-2">
                {movement.tags.map(tag => (
                  <span key={tag} className={`px-3 py-1 ${isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-700'} rounded-lg text-sm`}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex space-x-3">
            <button
              onClick={onViewFullPage}
              className="bg-green-600 text-white font-semibold px-4 py-2 rounded-lg shadow hover:bg-green-700 transition"
            >
              View Movement Page
            </button>
            <button
              onClick={onClose}
              className={`flex-1 border-2 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'} py-3 rounded-lg font-medium ${isDark ? 'text-gray-200' : ''}`}
            >
              Close
            </button>
            <button className="btn btn-primary">More</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovementPreviewModal;

