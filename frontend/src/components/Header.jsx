import React from 'react';
import { Search, Plus, Bell, User, LogOut, Moon, Sun, X } from 'lucide-react';
import plotLogo from '../assets/plot-logo.svg';
import plotPlusDark from '../assets/plot-plus-dark.svg';
import plotLogoDark from '../assets/plot-logo-dark.svg';

const Header = ({
  isDark,
  toggleTheme,
  viewMode,
  selectedMovement,
  onBackToMovements,
  showSearch,
  onToggleSearch,
  currentUser,
  onCreateClick,
  showProfileDropdown,
  onToggleProfileDropdown,
  profileDropdownRef,
  onProfileClick,
  onSignOut,
  onSignInClick,
  searchQuery,
  onSearchChange,
  onTagClick,
  onClearSearch
}) => {
  const suggestedTags = [
    'environment',
    'sustainability',
    'community',
    'activism',
    'social justice',
    'education',
    'health',
    'arts',
    'technology',
    'local'
  ];

  const isHomePage = viewMode === 'movements';

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-12 py-6 z-10 flex-shrink-0">
      {/* Single row: Logo, Search/Tags (centered), Right actions */}
      <div className="flex items-start justify-between">
        {/* Left: Logo and movement name */}
        <div className="flex items-center space-x-4 flex-shrink-0">
          <img src={isDark ? plotLogoDark : plotLogo} alt="Plot" className="h-8 w-auto"/>
          {viewMode === 'movement-details' && selectedMovement && (
            <>
              <button 
                onClick={onBackToMovements}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ← All Movements
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className="font-medium dark:text-gray-200">{selectedMovement.name}</span>
            </>
          )}
        </div>
        
        {/* Center: Search bar and tags grouped together (only on home page) */}
        {isHomePage && (
          <div className="flex flex-col items-center space-y-3 flex-1 max-w-2xl mx-8">
            {/* Search Bar */}
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Explore movements"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-12 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-300"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestedTags.slice(0, 5).map((tag) => (
                <button
                  key={tag}
                  onClick={() => onTagClick(tag)}
                  className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-full transition-colors"
                  style={{
                    color: isDark ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)'
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Right: Actions */}
        <div className="flex items-center space-x-3 flex-shrink-0">
          <button 
            onClick={toggleTheme}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          {!isHomePage && (
            <button 
              onClick={onToggleSearch}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <Search className="w-5 h-5" />
            </button>
          )}
        
          {currentUser ? (
            <>
              <button 
                onClick={onCreateClick}
                className="btn btn-primary"
              >
                <span>Create</span>
              </button>
              <div className="relative" ref={profileDropdownRef}>
                <button 
                  onClick={onToggleProfileDropdown}
                  className="p-2 hover:bg-gray-100 rounded-lg relative"
                >
                  <User className="w-5 h-5" />
                </button>
                {showProfileDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <button
                      onClick={onProfileClick}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                    >
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={onSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button 
              onClick={onSignInClick}
              className="btn btn-primary"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

