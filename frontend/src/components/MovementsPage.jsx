import React, { useState } from 'react';
import MovementsList from './MovementsList';
import SearchResultsPanel from './SearchResultsPanel';
import MovementPreviewModal from './MovementPreviewModal';
import HoverPreviewModal from './HoverPreviewModal';
import { useMovementMarkers } from '../hooks/useMovementMarkers';

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
        <div className="pointer-events-auto w-96 bg-white border-l border-gray-200 overflow-y-auto">
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

