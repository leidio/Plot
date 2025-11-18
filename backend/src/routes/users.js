const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        location: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: { message: 'Failed to fetch user' } });
  }
});

// Get current user's movements (created and joined)
router.get('/me/movements', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('Fetching movements for userId:', userId);

    // Debug: Check all movements in database
    const allMovements = await prisma.movement.findMany({
      select: { id: true, name: true, ownerId: true, isActive: true }
    });
    console.log('All movements in database:', allMovements);

    // Get movements created by user (show all, regardless of isActive status)
    const createdMovements = await prisma.movement.findMany({
      where: { ownerId: userId },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        },
        _count: {
          select: { members: true, ideas: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('Found created movements:', createdMovements.length);
    console.log('Created movements details:', createdMovements.map(m => ({ id: m.id, name: m.name, ownerId: m.ownerId })));

    // Get movements user has joined (excluding ones they created)
    const memberships = await prisma.movementMember.findMany({
      where: { userId },
      include: {
        movement: {
          include: {
            owner: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            },
            _count: {
              select: { members: true, ideas: true }
            }
          }
        }
      }
    });

    const joinedMovements = memberships
      .map(m => m.movement)
      .filter(m => m && m.isActive && m.ownerId !== userId); // Exclude movements they created and inactive ones

    console.log('Found joined movements:', joinedMovements.length);

    res.json({ 
      created: createdMovements,
      joined: joinedMovements
    });
  } catch (error) {
    console.error('Error fetching user movements:', error);
    res.status(500).json({ error: { message: 'Failed to fetch user movements' } });
  }
});

// Get current user's ideas (supported)
router.get('/me/ideas', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get ideas user has supported
    const supports = await prisma.ideaSupport.findMany({
      where: { userId },
      include: {
        idea: {
          include: {
            creator: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            },
            movement: {
              select: { id: true, name: true }
            },
            _count: {
              select: { supporters: true, donations: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get ideas created by user
    const createdIdeas = await prisma.idea.findMany({
      where: { creatorId: userId },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        },
        movement: {
          select: { id: true, name: true }
        },
        _count: {
          select: { supporters: true, donations: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const supportedIdeas = supports.map(s => s.idea);

    res.json({ 
      created: createdIdeas,
      supported: supportedIdeas
    });
  } catch (error) {
    console.error('Error fetching user ideas:', error);
    res.status(500).json({ error: { message: 'Failed to fetch user ideas' } });
  }
});

module.exports = router;
