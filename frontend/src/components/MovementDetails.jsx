import React from 'react';
import { Users, Plus, X, Heart, DollarSign } from 'lucide-react';

const MovementDetails = ({ movement, ideas, currentUser, addIdeaMode, onIdeaSelect, onCreateIdea, onCancelAddIdea }) => {
  const isOwner = currentUser && (movement.ownerId === currentUser.id || movement.owner?.id === currentUser.id);

  return (
    <div className="p-4">
      <div className="mb-4 pb-4 border-b">
        <h2 className="text-lg font-semibold">{movement.name}</h2>
        <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
        <div className="flex items-center space-x-4 mt-3 text-sm">
          <div className="flex items-center space-x-1 text-gray-500">
            <Users className="w-4 h-4" />
            <span>{movement._count.members} members</span>
          </div>
          <span className="text-gray-400">by {movement.owner.firstName} {movement.owner.lastName}</span>
        </div>
        {!isOwner && (
          <button className="w-full mt-3 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">
            Join Movement
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Ideas ({ideas.length})</h3>
        {!addIdeaMode ? (
          <button
            onClick={onCreateIdea}
            className="text-sm text-green-600 hover:text-green-700 flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>Add Idea</span>
          </button>
        ) : (
          <button
            onClick={onCancelAddIdea}
            className="text-sm text-gray-600 hover:text-gray-700 flex items-center space-x-1"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        )}
      </div>

      {addIdeaMode && currentUser && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
          <p className="text-sm text-blue-800 font-medium mb-1">
            💡 Add Idea Mode Active
          </p>
          <p className="text-xs text-blue-700">
            Click anywhere on the map to place your idea at that location
          </p>
        </div>
      )}

      <div className="space-y-3">
        {ideas.map(idea => (
          <div
            key={idea.id}
            onClick={() => onIdeaSelect(idea)}
            className="p-3 border border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer hover:bg-blue-50 transition-all"
          >
            <h4 className="font-medium">{idea.title}</h4>
            <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>${((idea.fundingRaised || 0) / 100).toLocaleString()}</span>
                <span>${((idea.fundingGoal || 0) / 100).toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-green-600 h-1.5 rounded-full"
                  style={{ width: `${idea.fundingGoal > 0 ? Math.min(((idea.fundingRaised || 0) / idea.fundingGoal) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="flex items-center space-x-3 mt-2 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Heart className="w-4 h-4" />
                <span>{idea._count?.supporters || 0}</span>
              </div>
              <div className="flex items-center space-x-1">
                <DollarSign className="w-4 h-4" />
                <span>{idea._count?.donations || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MovementDetails;

