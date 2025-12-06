import React from 'react';
import { Users, MapPin, Lightbulb, Heart, DollarSign } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const SearchResultsPanel = ({ searchQuery, results, isSearching, onMovementSelect, onIdeaSelect, onClear }) => {
  const { isDark } = useTheme();
  const movementsCount = results.movements?.length || 0;
  const ideasCount = results.ideas?.length || 0;
  const totalCount = movementsCount + ideasCount;

  return (
    <div className="p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className={`text-lg font-semibold mb-2 ${isDark ? 'text-gray-200' : ''}`}>Search Results</h2>
          {isSearching ? (
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Searching...</p>
          ) : (
            <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              Found <span className="font-medium">Movements ({movementsCount})</span>, <span className="font-medium">Ideas ({ideasCount})</span>
            </p>
          )}
          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>for "{searchQuery}"</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className={`text-sm ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
          disabled={isSearching}
        >
          Clear
        </button>
      </div>

      {isSearching ? (
        <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className={`inline-block w-6 h-6 border-2 ${isDark ? 'border-gray-600' : 'border-gray-300'} border-t-green-600 rounded-full animate-spin`}></div>
          <p className="mt-2">Searching...</p>
        </div>
      ) : totalCount === 0 ? (
        <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <p>No results found for "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-6">
          {movementsCount > 0 && (
            <div>
              <h3 className={`font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                <Users className="w-4 h-4" />
                Movements ({movementsCount})
              </h3>
              <div className="space-y-3">
                {results.movements.map(movement => (
                  <div
                    key={movement.id}
                    onClick={() => onMovementSelect(movement)}
                    className={`p-4 border ${isDark ? 'border-gray-700 hover:border-green-500 hover:bg-green-900/20' : 'border-gray-200 hover:border-green-400 hover:bg-green-50'} rounded-lg cursor-pointer transition-all`}
                  >
                    <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{movement.name}</h4>
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{movement.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <div className={`flex items-center space-x-3 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <div className="flex items-center space-x-1">
                          <Users className="w-4 h-4" />
                          <span>{movement._count?.members || 0}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-4 h-4" />
                          <span>{movement._count?.ideas || 0}</span>
                        </div>
                      </div>
                      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{movement.city}, {movement.state}</span>
                    </div>
                    {movement.tags && movement.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {movement.tags.map(tag => (
                          <span
                            key={tag}
                            className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ideasCount > 0 && (
            <div>
              <h3 className={`font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                <Lightbulb className="w-4 h-4" />
                Ideas ({ideasCount})
              </h3>
              <div className="space-y-3">
                {results.ideas.map(idea => (
                  <div
                    key={idea.id}
                    onClick={() => onIdeaSelect(idea)}
                    className={`p-4 border ${isDark ? 'border-gray-700 hover:border-blue-500 hover:bg-blue-900/20' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'} rounded-lg cursor-pointer transition-all`}
                  >
                    <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{idea.title}</h4>
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{idea.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <div className={`flex items-center space-x-3 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <div className="flex items-center space-x-1">
                          <Heart className="w-4 h-4" />
                          <span>{idea._count?.supporters || 0}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <DollarSign className="w-4 h-4" />
                          <span>${((idea.fundingRaised || 0) / 100).toLocaleString()}</span>
                        </div>
                      </div>
                      {idea.movement && (
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{idea.movement.name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchResultsPanel;

