import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Lock, Trash2, X } from 'lucide-react';

const ProfileModal = ({
  currentUser,
  onClose,
  onUserUpdate,
  onSignOut,
  onMovementSelect,
  onIdeaSelect,
  apiCall
}) => {
  const [activeTab, setActiveTab] = useState('account');
  const [email, setEmail] = useState(currentUser.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userMovements, setUserMovements] = useState({ created: [], joined: [] });
  const [userIdeas, setUserIdeas] = useState({ created: [], supported: [] });
  const [loadingData, setLoadingData] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadUserData = useCallback(async () => {
    setLoadingData(true);
    try {
      if (activeTab === 'movements') {
        const response = await apiCall('get', '/users/me/movements');
        setUserMovements(response.data);
      } else if (activeTab === 'ideas') {
        const response = await apiCall('get', '/users/me/ideas');
        setUserIdeas(response.data);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [activeTab, apiCall]);

  useEffect(() => {
    if (activeTab === 'movements' || activeTab === 'ideas') {
      loadUserData();
    }
    setError('');
    setSuccess('');
  }, [activeTab, loadUserData]);

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await apiCall('put', '/auth/me/email', { email });
      if (response.data.user) {
        onUserUpdate(response.data.user);
        setSuccess('Email updated successfully');
        setEmail(response.data.user.email);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update email');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await apiCall('put', '/auth/me/password', { currentPassword, newPassword });
      setSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    try {
      await apiCall('delete', '/auth/me');
      onSignOut();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to delete account');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold">Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-48 border-r border-gray-200 bg-gray-50 p-4">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('account')}
                className={`w-full text-left px-4 py-2 rounded-lg ${
                  activeTab === 'account' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                Account
              </button>
              <button
                onClick={() => setActiveTab('movements')}
                className={`w-full text-left px-4 py-2 rounded-lg ${
                  activeTab === 'movements' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                My Movements
              </button>
              <button
                onClick={() => setActiveTab('ideas')}
                className={`w-full text-left px-4 py-2 rounded-lg ${
                  activeTab === 'ideas' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                My Ideas
              </button>
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Account Information</h3>
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Name</p>
                    <p className="font-medium">{currentUser.firstName} {currentUser.lastName}</p>
                  </div>
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Member since</p>
                    <p className="font-medium">
                      {new Date(currentUser.createdAt).toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    Update Email
                  </h3>
                  <form onSubmit={handleUpdateEmail} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                        {success}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Updating...' : 'Update Email'}
                    </button>
                  </form>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Lock className="w-5 h-5" />
                    Change Password
                  </h3>
                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                        {success}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold mb-4 text-red-600 flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />
                    Delete Account
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Once you delete your account, there is no going back. Please be certain.
                  </p>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                    >
                      Delete Account
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-red-600">Are you sure? This action cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteAccount}
                          disabled={loading}
                          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                        >
                          {loading ? 'Deleting...' : 'Yes, Delete Account'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'movements' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">My Movements</h3>
                {loadingData ? (
                  <p className="text-gray-500">Loading...</p>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium mb-3">Created ({userMovements.created.length})</h4>
                      {userMovements.created.length > 0 ? (
                        <div className="space-y-2">
                          {userMovements.created.map(movement => (
                            <div
                              key={movement.id}
                              onClick={() => {
                                onMovementSelect(movement);
                                onClose();
                              }}
                              className="p-4 border border-gray-200 rounded-lg hover:border-green-400 cursor-pointer hover:bg-green-50 transition-all"
                            >
                              <h5 className="font-medium">{movement.name}</h5>
                              <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span>{movement._count.members} members</span>
                                <span>{movement._count.ideas} ideas</span>
                                <span>{movement.city}, {movement.state}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">You haven't created any movements yet.</p>
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium mb-3">Joined ({userMovements.joined.length})</h4>
                      {userMovements.joined.length > 0 ? (
                        <div className="space-y-2">
                          {userMovements.joined.map(movement => (
                            <div
                              key={movement.id}
                              onClick={() => {
                                onMovementSelect(movement);
                                onClose();
                              }}
                              className="p-4 border border-gray-200 rounded-lg hover:border-green-400 cursor-pointer hover:bg-green-50 transition-all"
                            >
                              <h5 className="font-medium">{movement.name}</h5>
                              <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span>{movement._count.members} members</span>
                                <span>{movement._count.ideas} ideas</span>
                                <span>{movement.city}, {movement.state}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">You haven't joined any movements yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ideas' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">My Ideas</h3>
                {loadingData ? (
                  <p className="text-gray-500">Loading...</p>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium mb-3">Created ({userIdeas.created.length})</h4>
                      {userIdeas.created.length > 0 ? (
                        <div className="space-y-2">
                          {userIdeas.created.map(idea => (
                            <div
                              key={idea.id}
                              onClick={() => {
                                onIdeaSelect(idea);
                                onClose();
                              }}
                              className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer hover:bg-blue-50 transition-all"
                            >
                              <h5 className="font-medium">{idea.title}</h5>
                              <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span>{idea.movement?.name}</span>
                                <span>{idea._count?.supporters || 0} supporters</span>
                                <span>${((idea.fundingRaised || 0) / 100).toLocaleString()} raised</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">You haven't created any ideas yet.</p>
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium mb-3">Supported ({userIdeas.supported.length})</h4>
                      {userIdeas.supported.length > 0 ? (
                        <div className="space-y-2">
                          {userIdeas.supported.map(idea => (
                            <div
                              key={idea.id}
                              onClick={() => {
                                onIdeaSelect(idea);
                                onClose();
                              }}
                              className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer hover:bg-blue-50 transition-all"
                            >
                              <h5 className="font-medium">{idea.title}</h5>
                              <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span>{idea.movement?.name}</span>
                                <span>{idea._count?.supporters || 0} supporters</span>
                                <span>${((idea.fundingRaised || 0) / 100).toLocaleString()} raised</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">You haven't supported any ideas yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;

