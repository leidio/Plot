const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, location } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        error: { message: 'Email, password, first name, and last name are required' }
      });
    }

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

    res.status(201).json({ user, token });
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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: { message: 'Email and password are required' }
      });
    }

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

    const { passwordHash, ...userData } = user;

    res.json({ user: userData, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: { message: 'Login failed' } });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        error: { message: 'No token provided' }
      });
    }

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
      return res.status(404).json({ 
        error: { message: 'User not found' }
      });
    }

    res.json({ user });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(401).json({ error: { message: 'Invalid or expired token' } });
  }
});

// Update email (requires authentication)
router.put('/me/email', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: { message: 'Email is required' } });
    }

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
router.put('/me/password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: { message: 'Current password and new password are required' } });
    }

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

// Delete account (requires authentication)
router.delete('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: decoded.userId }
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: { message: 'Failed to delete account' } });
  }
});

module.exports = router;
