const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// Get all movements
router.get('/', async (req, res) => {
  try {
    const { city, state, tags, search, limit = 50, offset = 0 } = req.query;

    const where = { isActive: true };

    if (city) where.city = city;
    if (state) where.state = state;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (tags) {
      where.tags = { hasSome: tags.split(',') };
    }

    const movements = await prisma.movement.findMany({
      where,
      take: parseInt(limit),
      skip: parseInt(offset),
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

    res.json({ movements });
  } catch (error) {
    console.error('Error fetching movements:', error);
    res.status(500).json({ error: { message: 'Failed to fetch movements' } });
  }
});

// Get single movement
router.get('/:id', async (req, res) => {
  try {
    const movement = await prisma.movement.findUnique({
      where: { id: req.params.id },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, avatar: true, bio: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          }
        },
        ideas: {
          include: {
            creator: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            },
            _count: {
              select: { supporters: true, donations: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!movement) {
      return res.status(404).json({ error: { message: 'Movement not found' } });
    }

    res.json({ movement });
  } catch (error) {
    console.error('Error fetching movement:', error);
    res.status(500).json({ error: { message: 'Failed to fetch movement' } });
  }
});

// Create movement
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, latitude, longitude, city, state, tags, coverImage } = req.body;

    if (!name || !description || !latitude || !longitude || !city || !state) {
      return res.status(400).json({ 
        error: { message: 'Name, description, location, city, and state are required' }
      });
    }

    const movement = await prisma.movement.create({
      data: {
        name,
        description,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        city,
        state,
        tags: tags || [],
        coverImage,
        ownerId: req.user.userId
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      }
    });

    await prisma.movementMember.create({
      data: {
        userId: req.user.userId,
        movementId: movement.id,
        role: 'moderator'
      }
    });

    res.status(201).json({ movement });
  } catch (error) {
    console.error('Error creating movement:', error);
    res.status(500).json({ error: { message: 'Failed to create movement' } });
  }
});

// Join movement
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const existingMembership = await prisma.movementMember.findUnique({
      where: {
        userId_movementId: {
          userId: req.user.userId,
          movementId: req.params.id
        }
      }
    });

    if (existingMembership) {
      return res.status(409).json({ 
        error: { message: 'Already a member of this movement' }
      });
    }

    const membership = await prisma.movementMember.create({
      data: {
        userId: req.user.userId,
        movementId: req.params.id
      },
      include: {
        movement: {
          select: { name: true, ownerId: true }
        }
      }
    });

    await prisma.notification.create({
      data: {
        userId: membership.movement.ownerId,
        type: 'movement_joined',
        title: 'New member joined your movement',
        message: `Someone joined ${membership.movement.name}`,
        link: `/movements/${req.params.id}`
      }
    });

    res.status(201).json({ membership });
  } catch (error) {
    console.error('Error joining movement:', error);
    res.status(500).json({ error: { message: 'Failed to join movement' } });
  }
});

// Leave movement
router.delete('/:id/leave', authenticateToken, async (req, res) => {
  try {
    await prisma.movementMember.delete({
      where: {
        userId_movementId: {
          userId: req.user.userId,
          movementId: req.params.id
        }
      }
    });

    res.json({ message: 'Successfully left movement' });
  } catch (error) {
    console.error('Error leaving movement:', error);
    res.status(500).json({ error: { message: 'Failed to leave movement' } });
  }
});

module.exports = router;
