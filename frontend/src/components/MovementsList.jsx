import React from 'react';
import { Users, MapPin } from 'lucide-react';

const MovementsList = ({ movements, onSelect, onTagClick }) => (
  <div className="p-4">
    <h2 className="text-lg font-semibold mb-4">
      Movements ({movements.length})
    </h2>
    <div className="space-y-3">
      {movements.map(movement => (
        <div
          key={movement.id}
          onClick={() => onSelect(movement)}
          className="p-4 border border-gray-200 rounded-lg hover:border-green-400 cursor-pointer hover:bg-green-50 transition-all"
        >
          <h3 className="font-medium text-gray-900">{movement.name}</h3>
          <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center space-x-3 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{movement._count.members}</span>
              </div>
              <div className="flex items-center space-x-1">
                <MapPin className="w-4 h-4" />
                <span>{movement._count.ideas}</span>
              </div>
            </div>
            <span className="text-xs text-gray-400">{movement.city}, {movement.state}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {movement.tags.map(tag => (
              <button
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTagClick) onTagClick(tag);
                }}
                className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 cursor-pointer transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default MovementsList;

