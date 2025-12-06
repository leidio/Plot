import React from 'react';
import { Search, Plus, Bell, User, LogOut, Moon, Sun } from 'lucide-react';

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
  onSignInClick
}) => {
  return (
    <header className={`${isDark ? 'bg-gray-800' : 'bg-white'} dark:bg-gray-800 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} dark:border-gray-700 px-4 py-3 flex items-center justify-between z-10`}>
      <div className="flex items-center space-x-4">
        <h1 className="text-2xl font-bold text-green-600 dark:text-green-500">Plot</h1>
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
      
      <div className="flex items-center space-x-3">
        <button 
          onClick={toggleTheme}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <button 
          onClick={onToggleSearch}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
        >
          <Search className="w-5 h-5" />
        </button>
        
        {currentUser ? (
          <>
            <button className="p-2 hover:bg-gray-100 rounded-lg relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <button 
              onClick={onCreateClick}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
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
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;

