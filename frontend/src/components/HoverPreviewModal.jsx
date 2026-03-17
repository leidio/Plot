import React, { useEffect, useState } from 'react';
import { Users, MapPin, Lightbulb, Heart, DollarSign } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const HoverPreviewModal = ({ hoveredItem, onViewMovement, onViewIdea }) => {
  const { isDark } = useTheme();
  const [activeHover, setActiveHover] = useState(null);
  const [isPinned, setIsPinned] = useState(false);

  // Keep a local copy of the last hovered item so the popover can
  // stay visible while the user moves from marker to CTA, but disappear
  // once the mouse leaves both marker and card.
  useEffect(() => {
    if (hoveredItem && hoveredItem.position) {
      setActiveHover(hoveredItem);
      return;
    }

    if (!hoveredItem && !isPinned) {
      setActiveHover(null);
    }
  }, [hoveredItem, isPinned]);

  if (!activeHover || !activeHover.position) {
    return null;
  }

  const { type, item, position } = activeHover;

  if (
    typeof position.x !== 'number' ||
    typeof position.y !== 'number' ||
    isNaN(position.x) ||
    isNaN(position.y)
  ) {
    return null;
  }

  // Dynamically position the card around the placemarker without panning the map.
  // Try to keep it above and to the right of the marker, but flip horizontally/vertically
  // when there isn't enough space, always clamping inside the visible map area.
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
  const CARD_WIDTH = 320;
  const CARD_HEIGHT = 220;
  const margin = 12;

  // Map viewport bounds (where the Mapbox canvas lives)
  let mapLeft = 0;
  let mapRight = viewportWidth;
  let mapTop = 0;
  let mapBottom = viewportHeight;

  if (typeof document !== 'undefined') {
    const mapEl = document.querySelector('.mapboxgl-map');
    if (mapEl && mapEl.getBoundingClientRect) {
      const rect = mapEl.getBoundingClientRect();
      mapLeft = rect.left;
      mapRight = rect.right;
      mapTop = rect.top;
      mapBottom = rect.bottom;
    }
  }

  let left = position.x + margin; // default to the right of the marker
  if (left + CARD_WIDTH + margin > mapRight) {
    left = position.x - CARD_WIDTH - margin; // flip to left side
  }
  left = Math.max(mapLeft + margin, Math.min(left, mapRight - CARD_WIDTH - margin));

  let top = position.y - CARD_HEIGHT - margin; // default above the marker
  if (top < mapTop + margin) {
    top = position.y + margin; // flip below if not enough room above
  }
  top = Math.max(mapTop + margin, Math.min(top, mapBottom - CARD_HEIGHT - margin));

  const style = {
    position: 'fixed',
    left: `${left}px`,
    top: `${top}px`,
    zIndex: 10000,
    pointerEvents: 'auto',
    maxWidth: `${CARD_WIDTH}px`,
    minWidth: '240px'
  };

  if (type === 'movement') {
    const name = item.name || 'Untitled Movement';
    const description = item.description || 'No description';
    const truncatedDescription =
      description.length > 160 ? `${description.substring(0, 160)}…` : description;

    const followers = item._count?.members || 0;
    const raised = (item.totalRaised ?? item.fundingRaised ?? 0) / 100;
    const createdLabel = (() => {
      if (!item.createdAt) return null;
      const createdDate = new Date(item.createdAt);
      const now = new Date();
      const diffYears = now.getFullYear() - createdDate.getFullYear();
      if (diffYears > 1) return `Created ${diffYears} years ago`;
      if (diffYears === 1) return 'Created 1 year ago';
      return 'Created this year';
    })();

    return (
      <div
        style={style}
        className={`rounded-3xl shadow-xl border ${
          isDark
            ? 'bg-gray-800/95 border-gray-700'
            : 'bg-gray-100 border-gray-200'
        } p-4`}
        onMouseEnter={() => setIsPinned(true)}
        onMouseLeave={() => setIsPinned(false)}
      >
        <h3
          className={`font-semibold text-base mb-2 tracking-tight ${
            isDark ? 'text-gray-50' : 'text-gray-900'
          }`}
        >
          {name}
        </h3>

        <div className="flex items-center gap-2 text-xs mb-3">
          <div className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-gray-400" />
            <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
              {item.city}, {item.state}
            </span>
          </div>
          {createdLabel && (
            <>
              <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                •
              </span>
              <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                {createdLabel}
              </span>
            </>
          )}
        </div>

        <p
          className={`text-xs leading-relaxed mb-4 ${
            isDark ? 'text-gray-200' : 'text-gray-700'
          }`}
        >
          {truncatedDescription}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div
            className={`rounded-2xl py-3 px-4 text-center ${
              isDark ? 'bg-gray-700' : 'bg-white'
            }`}
          >
            <div
              className={`text-lg font-semibold ${
                isDark ? 'text-gray-50' : 'text-gray-900'
              }`}
            >
              {followers.toLocaleString()}
            </div>
            <div
              className={`text-[11px] mt-1 ${
                isDark ? 'text-gray-300' : 'text-gray-600'
              }`}
            >
              Followers
            </div>
          </div>
          <div
            className={`rounded-2xl py-3 px-4 text-center ${
              isDark ? 'bg-gray-700' : 'bg-white'
            }`}
          >
            <div
              className={`text-lg font-semibold ${
                isDark ? 'text-gray-50' : 'text-gray-900'
              }`}
            >
              ${Math.round(raised).toLocaleString()}
            </div>
            <div
              className={`text-[11px] mt-1 ${
                isDark ? 'text-gray-300' : 'text-gray-600'
              }`}
            >
              Raised
            </div>
          </div>
        </div>

        <div className="mt-1">
          <button
            type="button"
            onClick={() => onViewMovement && onViewMovement(item)}
            className={`w-full text-center text-[13px] font-semibold py-2.5 rounded-full ${
              isDark ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white'
            }`}
          >
            View movement
          </button>
        </div>
      </div>
    );
  }

  if (type === 'idea') {
    const movementName = item.movement?.name || 'Unknown Movement';
    const title = item.title || 'Untitled Idea';
    const description = item.description || 'No description';
    const truncatedDescription =
      description.length > 160 ? `${description.substring(0, 160)}…` : description;
    const supporters = item._count?.supporters || 0;
    const raised = (item.fundingRaised ?? 0) / 100;
    const locationLabel =
      item.movement?.city && item.movement?.state
        ? `${item.movement.city}, ${item.movement.state}`
        : null;

    return (
      <div
        style={style}
        className={`rounded-3xl shadow-xl border ${
          isDark
            ? 'bg-gray-800/95 border-gray-700'
            : 'bg-gray-100 border-gray-200'
        } p-4`}
        onMouseEnter={() => setIsPinned(true)}
        onMouseLeave={() => setIsPinned(false)}
      >
        <h3
          className={`font-semibold text-base mb-2 tracking-tight ${
            isDark ? 'text-gray-50' : 'text-gray-900'
          }`}
        >
          {title}
        </h3>

        <div className="flex items-center gap-2 text-xs mb-3">
          {locationLabel && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                {locationLabel}
              </span>
            </div>
          )}
          {locationLabel && (
            <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>•</span>
          )}
          <div className="flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-gray-400" />
            <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
              {movementName}
            </span>
          </div>
        </div>

        <p
          className={`text-xs leading-relaxed mb-4 ${
            isDark ? 'text-gray-200' : 'text-gray-700'
          }`}
        >
          {truncatedDescription}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div
            className={`rounded-2xl py-3 px-4 text-center ${
              isDark ? 'bg-gray-700' : 'bg-white'
            }`}
          >
            <div
              className={`text-lg font-semibold ${
                isDark ? 'text-gray-50' : 'text-gray-900'
              }`}
            >
              {supporters.toLocaleString()}
            </div>
            <div
              className={`text-[11px] mt-1 ${
                isDark ? 'text-gray-300' : 'text-gray-600'
              }`}
            >
              Supporters
            </div>
          </div>
          <div
            className={`rounded-2xl py-3 px-4 text-center ${
              isDark ? 'bg-gray-700' : 'bg-white'
            }`}
          >
            <div
              className={`text-lg font-semibold ${
                isDark ? 'text-gray-50' : 'text-gray-900'
              }`}
            >
              ${Math.round(raised).toLocaleString()}
            </div>
            <div
              className={`text-[11px] mt-1 ${
                isDark ? 'text-gray-300' : 'text-gray-600'
              }`}
            >
              Raised
            </div>
          </div>
        </div>

        <div className="mt-1">
          <button
            type="button"
            onClick={() => onViewIdea && onViewIdea(item)}
            className={`w-full text-center text-[13px] font-semibold py-2.5 rounded-full ${
              isDark ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white'
            }`}
          >
            View idea
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default HoverPreviewModal;

