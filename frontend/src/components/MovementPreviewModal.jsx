import React from 'react';
import { MapPin, X } from 'lucide-react';

const MovementPreviewModal = ({ movement, onClose, onViewFullPage }) => {
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
        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-semibold pr-8">{movement.name || 'Untitled Movement'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          <p className="text-gray-700 mb-6">{movement.description || 'No description'}</p>

          <div className="bg-gray-50 p-4 rounded-lg mb-6 text-sm text-gray-700 space-y-2">
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="font-medium">Location</span>
            </div>
            <p className="ml-6 text-gray-800">{movement.city}, {movement.state}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-900">{movement._count?.members || 0}</div>
              <div className="text-xs text-gray-600 mt-1">Members</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-900">{movement._count?.ideas || 0}</div>
              <div className="text-xs text-gray-600 mt-1">Ideas</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-sm font-medium text-gray-900">{formatDate(movement.createdAt)}</div>
              <div className="text-xs text-gray-600 mt-1">Launched</div>
            </div>
          </div>

          {movement.owner && (
            <div className="mb-6">
              <h3 className="font-medium text-sm text-gray-500 mb-1">Manager</h3>
              <p className="text-gray-900">
                {movement.owner.firstName || 'Unknown'} {movement.owner.lastName || ''}
              </p>
            </div>
          )}

          {movement.tags && movement.tags.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-sm text-gray-500 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {movement.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm">
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
              className="flex-1 border-2 border-gray-300 py-3 rounded-lg hover:bg-gray-50 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovementPreviewModal;

