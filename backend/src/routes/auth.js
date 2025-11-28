const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const rateLimit = require('express-rate-limit');
const { validateRegister, validateLogin, validatePasswordUpdate, validateEmailUpdate } = require('../middleware/validation');

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { error: { message: 'Too many authentication attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper function to set auth cookie
const setAuthCookie = (res, token) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
};

// Helper function to clear auth cookie
const clearAuthCookie = (res) => {
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
};

// Register new user
router.post('/register', authLimiter, validateRegister, async (req, res) => {
  try {
    const { email, password, firstName, lastName, location } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ 
        error: { message: 'User with this email already exists' }
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        location
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        location: true,
        createdAt: true
      }
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set httpOnly cookie
    setAuthCookie(res, token);

    res.status(201).json({ user });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Registration failed';
    
    if (error.code === 'P2002') {
      errorMessage = 'A user with this email already exists';
    } else if (error.code === 'P1001') {
      errorMessage = 'Database connection failed. Please check your database configuration.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      error: { 
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      } 
    });
  }
});

// Login
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ 
        error: { message: 'Invalid credentials' }
      });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ 
        error: { message: 'Invalid credentials' }
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set httpOnly cookie
    setAuthCookie(res, token);

    const { passwordHash, ...userData } = user;

    res.json({ user: userData });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: { message: 'Login failed' } });
  }
});

// Get current user (optional - returns null if not authenticated)
router.get('/me', async (req, res) => {
  try {
    // Check cookie first, then fall back to Authorization header for backward compatibility
    const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      // Return 200 with null user for anonymous users
      return res.json({ user: null });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          location: true,
          createdAt: true
        }
      });

      if (!user) {
        return res.json({ user: null });
      }

      res.json({ user });
    } catch (jwtError) {
      // Invalid or expired token - treat as anonymous
      res.json({ user: null });
    }
  } catch (error) {
    console.error('Auth verification error:', error);
    // Return null user instead of error for better UX
    res.json({ user: null });
  }
});

// Update email (requires authentication)
router.put('/me/email', validateEmailUpdate, async (req, res) => {
  try {
    const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = req.body;

    // Check if email is already taken
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.id !== decoded.userId) {
      return res.status(409).json({ error: { message: 'Email already in use' } });
    }

    const user = await prisma.user.update({
      where: { id: decoded.userId },
      data: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        location: true,
        createdAt: true
      }
    });

    res.json({ user });
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ error: { message: 'Failed to update email' } });
  }
});

// Update password (requires authentication)
router.put('/me/password', validatePasswordUpdate, async (req, res) => {
  try {
    const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { currentPassword, newPassword } = req.body;

    // Get user with password hash
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: { message: 'Current password is incorrect' } });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { passwordHash }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: { message: 'Failed to update password' } });
  }
});

// Logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out successfully' });
});

// Delete account (requires authentication)
router.delete('/me', async (req, res) => {
  try {
    const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: decoded.userId }
    });

    // Clear auth cookie
    clearAuthCookie(res);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: { message: 'Failed to delete account' } });
  }
});

module.exports = router;
