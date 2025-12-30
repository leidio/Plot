import React from 'react';
import { Search } from 'lucide-react';

const SecondaryHeader = ({
  searchQuery,
  onSearchChange,
  onTagClick
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

  const handleTagClick = (tag) => {
    onTagClick(tag);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-12 py-6 flex-shrink-0">
      <div className="max-w-7xl mx-auto">
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search movements, ideas, locations..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
          />
        </div>

        {/* Suggested Tags */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 mr-2">Suggested:</span>
          {suggestedTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SecondaryHeader;

