import React, { useState } from 'react';

const AuthModal = ({ mode, onClose, onSuccess, onSwitchMode, apiCall }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const data = mode === 'login'
        ? { email, password }
        : { email, password, firstName, lastName };

      const response = await apiCall('post', endpoint, data);

      if (response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        if (response.data.user) {
          onSuccess(response.data.user);
        } else {
          onSuccess({ id: '1', firstName: 'User', lastName: '', email });
        }
      } else {
        throw new Error('No token received');
      }
    } catch (err) {
      console.error('Auth error:', err);
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        setError('Cannot connect to server. Make sure the backend is running on port 3001.');
      } else if (err.response) {
        const errorMessage = err.response.data?.error?.message ||
          err.response.data?.message ||
          `Failed to ${mode === 'login' ? 'sign in' : 'create account'}`;
        setError(errorMessage);
      } else {
        setError(
          err.message ||
          `Failed to ${mode === 'login' ? 'sign in' : 'create account'}. Please try again.`
        );
      }
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-2xl font-bold mb-4">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <input
                type="text"
                placeholder="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <input
                type="text"
                placeholder="Last Name *"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          />
          <input
            type="password"
            placeholder="Password *"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          />
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? (mode === 'login' ? 'Signing In...' : 'Creating Account...') : (mode === 'login' ? 'Sign In' : 'Sign Up')}
          </button>
        </form>
        <div className="mt-3 text-center">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-600 hover:text-gray-800 disabled:opacity-50 mr-4"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
            disabled={loading}
            className="text-green-600 hover:text-green-700 disabled:opacity-50 text-sm"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;

