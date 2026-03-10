import React, { useState } from 'react';
import { Search, Menu, X, Moon, Sun, User, LogOut, Sparkles } from 'lucide-react';
import plotLogo from '../assets/plot-logo.svg';
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
  onClearSearch,
  showIntelligenceLayer,
  onToggleIntelligence
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSearchEngaged, setIsSearchEngaged] = useState(false);
  
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
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 z-10 flex-shrink-0">
      {/* Single row: Logo + CTA, Search/Tags (centered), Hamburger */}
      <div className="flex items-start justify-between">
        {/* Left: Logo and Start a Movement button */}
        <div className="flex items-center space-x-4 flex-shrink-0">
          <img src={isDark ? plotLogoDark : plotLogo} alt="Plot" className="h-8 w-auto"/>
          {viewMode === 'movement-details' && selectedMovement ? (
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
          ) : (
            <button 
              onClick={currentUser ? onCreateClick : onSignInClick}
              className="btn btn-primary rounded-full px-5 py-2 text-sm font-medium"
            >
              Start a Movement
            </button>
          )}
        </div>
        
        {/* Center: Search bar and tags grouped together (only on home page) */}
        {isHomePage && (
          <div className="flex flex-col items-center flex-1 max-w-xl mx-8">
            {/* Search Bar */}
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search for movements in your city"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setIsSearchEngaged(true)}
                onBlur={() => {
                  setTimeout(() => {
                    if (!searchQuery?.trim()) setIsSearchEngaged(false);
                  }, 120);
                }}
                className="w-full pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-300"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              )}

              {(isSearchEngaged || !!searchQuery?.trim()) && (
                <div
                  className={`absolute left-0 right-0 mt-2 rounded-2xl border shadow-lg px-3 py-2 flex flex-wrap gap-2 justify-center z-20 ${
                    isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
                  }`}
                >
                  {suggestedTags.slice(0, 5).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => onTagClick(tag)}
                      className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-full transition-colors"
                      style={{
                        color: isDark ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)'
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Right: Intelligence toggle + Hamburger Menu */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {viewMode !== 'movements' && (
            <button
              onClick={() => onToggleIntelligence?.()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showIntelligenceLayer
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
              aria-label={showIntelligenceLayer ? 'Turn off Intelligence' : 'Turn on Intelligence'}
              title="Intelligence: analyze the map or generate movements"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Intelligence</span>
            </button>
          )}
          <div className="relative" ref={profileDropdownRef}>
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6 text-gray-700 dark:text-gray-300" />
            </button>
          
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
              {/* Theme toggle */}
              <button
                onClick={() => { toggleTheme(); setMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              
              <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
              
              {currentUser ? (
                <>
                  <button
                    onClick={() => { onProfileClick(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                  >
                    <User className="w-4 h-4" />
                    <span>Profile</span>
                  </button>
                  <button
                    onClick={() => { onSignOut(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { onSignInClick(); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                >
                  <User className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

