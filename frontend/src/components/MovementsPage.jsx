import React, { useState } from 'react';
import MovementsList from './MovementsList';
import SearchResultsPanel from './SearchResultsPanel';
import HoverPreviewModal from './HoverPreviewModal';
import { useMovementMarkers } from '../hooks/useMovementMarkers';
import { useTheme } from '../hooks/useTheme';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MovementsPage = ({
  mapRef,
  markersRef,
  movements,
  searchResults,
  isSearching,
  searchQuery,
  onSearchChange,
  onMovementSelect,
  onIdeaSelect,
  showSearch,
  onClearSearch,
  setPreviewMovement
}) => {
  const [hoveredItem, setHoveredItem] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const { isDark } = useTheme();

  useMovementMarkers({
    mapRef,
    markersRef,
    viewMode: 'movements',
    movements,
    showSearch,
    setHoveredItem,
    setPreviewMovement
  });

  return (
    <>
      <div className={`absolute right-0 top-0 bottom-0 pointer-events-auto ${isDark ? 'bg-gray-800' : 'bg-white'} border-l ${isDark ? 'border-gray-700' : 'border-gray-200'} flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-14' : 'w-96'}`}>
          <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex-shrink-0`}>
            {!sidebarCollapsed && (
              <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                {searchQuery.trim() ? 'Search Results' : 'Movements'}
              </h2>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`p-1 rounded-full ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors ml-auto`}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronLeft className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
              ) : (
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
              )}
            </button>
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto">
              {searchQuery.trim() ? (
                <SearchResultsPanel
                  searchQuery={searchQuery}
                  results={searchResults}
                  isSearching={isSearching}
                  onMovementSelect={onMovementSelect}
                  onIdeaSelect={onIdeaSelect}
                  onClear={onClearSearch}
                />
              ) : (
                <MovementsList
                  movements={movements}
                  onSelect={onMovementSelect}
                  onTagClick={(tag) => onSearchChange(tag)}
                />
              )}
            </div>
          )}
      </div>

      <HoverPreviewModal hoveredItem={hoveredItem} />
    </>
  );
};

export default MovementsPage;

