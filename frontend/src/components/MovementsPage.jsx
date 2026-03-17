import React, { useState } from 'react';
import MovementsList from './MovementsList';
import SearchResultsPanel from './SearchResultsPanel';
import HoverPreviewModal from './HoverPreviewModal';
import { useMovementMarkers } from '../hooks/useMovementMarkers';
import { useTheme } from '../hooks/useTheme';
import { List, X, Sparkles } from 'lucide-react';

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
  setPreviewMovement,
  returnToMovement,
  onBackFromTagSearch,
  showIntelligenceLayer,
  onToggleIntelligence
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
      {/* Floating pills: Explore movements + Intelligence (Intelligence hidden while tray open) */}
      {sidebarCollapsed && !showIntelligenceLayer && (
        <div className="absolute right-4 top-4 pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="flex items-center space-x-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow"
          >
            <List className={`w-5 h-5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
            <span className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Explore movements
            </span>
          </button>
          {!showIntelligenceLayer && (
            <button
              onClick={onToggleIntelligence}
              className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg transition-shadow"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">Intelligence</span>
            </button>
          )}
        </div>
      )}

      {/* Slide-out tray/sidebar */}
      <div 
        className={`absolute right-0 top-0 bottom-0 pointer-events-auto ${isDark ? 'bg-gray-800' : 'bg-white'} border-l ${isDark ? 'border-gray-700' : 'border-gray-200'} flex flex-col transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'translate-x-full' : 'translate-x-0'} w-96`}
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex-shrink-0`}>
          <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            {searchQuery.trim() ? 'Search Results' : 'Movements'}
          </h2>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className={`p-1 rounded-full ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
            aria-label="Close sidebar"
          >
            <X className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {searchQuery.trim() ? (
            <SearchResultsPanel
              searchQuery={searchQuery}
              results={searchResults}
              isSearching={isSearching}
              onMovementSelect={onMovementSelect}
              onIdeaSelect={onIdeaSelect}
              onClear={onClearSearch}
              returnToMovement={returnToMovement}
              onBackFromTagSearch={onBackFromTagSearch}
              onTagClick={onSearchChange}
            />
          ) : (
            <MovementsList
              movements={movements}
              onSelect={onMovementSelect}
              onTagClick={(tag) => onSearchChange(tag)}
            />
          )}
        </div>
      </div>

      <HoverPreviewModal
        hoveredItem={hoveredItem}
        onViewMovement={onMovementSelect}
      />
    </>
  );
};

export default MovementsPage;

