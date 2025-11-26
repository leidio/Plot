import React, { useState } from 'react';
import MovementsList from './MovementsList';
import SearchResultsPanel from './SearchResultsPanel';
import MovementPreviewModal from './MovementPreviewModal';
import HoverPreviewModal from './HoverPreviewModal';
import { useMovementMarkers } from '../hooks/useMovementMarkers';
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
  onClearSearch
}) => {
  const [hoveredItem, setHoveredItem] = useState(null);
  const [previewMovement, setPreviewMovement] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      <div className="absolute inset-0 pointer-events-none flex">
        <div className="flex-1" />
        <div className={`pointer-events-auto bg-white border-l border-gray-200 overflow-y-auto transition-all duration-300 ${sidebarCollapsed ? 'w-14' : 'w-96'}`}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            {!sidebarCollapsed && (
              <h2 className="text-lg font-semibold text-gray-800">
                {searchQuery.trim() ? 'Search Results' : 'Movements'}
              </h2>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors ml-auto"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
          {!sidebarCollapsed && (
            <>
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
            </>
          )}
        </div>
      </div>

      {previewMovement && (
        <MovementPreviewModal
          movement={previewMovement}
          onClose={() => setPreviewMovement(null)}
          onViewFullPage={async () => {
            setPreviewMovement(null);
            await onMovementSelect(previewMovement);
          }}
        />
      )}

      <HoverPreviewModal hoveredItem={hoveredItem} />
    </>
  );
};

export default MovementsPage;

