import React from 'react';
import { Users, MapPin, Lightbulb, Heart, DollarSign } from 'lucide-react';

const HoverPreviewModal = ({ hoveredItem }) => {
  if (!hoveredItem || !hoveredItem.position) {
    return null;
  }

  const { type, item, position } = hoveredItem;

  if (typeof position.x !== 'number' || typeof position.y !== 'number' || isNaN(position.x) || isNaN(position.y)) {
    return null;
  }

  const offsetX = 25;
  const offsetY = -10;
  const style = {
    position: 'fixed',
    left: `${Math.max(0, position.x + offsetX)}px`,
    top: `${Math.max(0, position.y + offsetY)}px`,
    zIndex: 10000,
    pointerEvents: 'none',
    transform: 'translateY(-100%)',
    maxWidth: '320px',
    minWidth: '240px'
  };

  if (type === 'movement') {
    const name = item.name || 'Untitled Movement';
    const description = item.description || 'No description';
    const truncatedDescription = description.length > 100 ? `${description.substring(0, 100)}...` : description;

    return (
      <div style={style} className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 max-w-xs">
        <h3 className="font-bold text-gray-900 text-sm mb-1 truncate">{name}</h3>
        <p
          className="text-xs text-gray-600 mb-2"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            maxHeight: '2.4em'
          }}
        >
          {truncatedDescription}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>{item._count?.members || 0} members</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span>
              {item.city}, {item.state}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'idea') {
    const movementName = item.movement?.name || 'Unknown Movement';
    const title = item.title || 'Untitled Idea';
    const description = item.description || 'No description';
    const truncatedDescription = description.length > 100 ? `${description.substring(0, 100)}...` : description;

    return (
      <div style={style} className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 max-w-xs">
        <h3 className="font-bold text-gray-900 text-sm mb-1 truncate">{title}</h3>
        <p
          className="text-xs text-gray-600 mb-2"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            maxHeight: '2.4em'
          }}
        >
          {truncatedDescription}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
          <div className="flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            <span className="truncate">{movementName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Heart className="w-3 h-3" />
            <span>{item._count?.supporters || 0} supporters</span>
          </div>
          {item.fundingRaised > 0 && (
            <div className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              <span>${((item.fundingRaised || 0) / 100).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default HoverPreviewModal;

