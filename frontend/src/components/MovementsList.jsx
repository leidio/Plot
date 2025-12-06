import React from 'react';
import { Users, MapPin } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const MovementsList = ({ movements, onSelect, onTagClick }) => {
  const { isDark } = useTheme();
  
  return (
  <div className="p-4">
    <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-gray-200' : ''}`}>
      Movements ({movements.length})
    </h2>
    <div className="space-y-3">
      {movements.map(movement => (
        <div
          key={movement.id}
          onClick={() => onSelect(movement)}
          className={`p-4 border ${isDark ? 'border-gray-700 hover:border-green-500 hover:bg-green-900/20' : 'border-gray-200 hover:border-green-400 hover:bg-green-50'} rounded-lg cursor-pointer transition-all`}
        >
          <h3 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{movement.name}</h3>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{movement.description}</p>
          <div className="flex items-center justify-between mt-3">
            <div className={`flex items-center space-x-3 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{movement._count.members}</span>
              </div>
              <div className="flex items-center space-x-1">
                <MapPin className="w-4 h-4" />
                <span>{movement._count.ideas}</span>
              </div>
            </div>
            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{movement.city}, {movement.state}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {movement.tags.map(tag => (
              <button
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTagClick) onTagClick(tag);
                }}
                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} cursor-pointer transition-colors`}
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
};

export default MovementsList;

