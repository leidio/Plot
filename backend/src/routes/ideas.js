const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// Get all ideas
router.get('/', async (req, res) => {
  try {
    const { movementId, status, search, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (movementId) where.movementId = movementId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const ideas = await prisma.idea.findMany({
      where,
      take: parseInt(limit),
      skip: parseInt(offset),
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        },
        movement: {
          select: { id: true, name: true }
        },
        _count: {
          select: { supporters: true, donations: true, comments: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ ideas });
  } catch (error) {
    console.error('Error fetching ideas:', error);
    res.status(500).json({ error: { message: 'Failed to fetch ideas' } });
  }
});

// Get single idea (optional auth - works with or without token)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const idea = await prisma.idea.findUnique({
      where: { id: req.params.id },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, avatar: true, bio: true }
        },
        movement: {
          select: { id: true, name: true, ownerId: true }
        },
        supporters: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          }
        },
        tasks: {
          orderBy: { order: 'asc' }
        },
        needs: true,
        donations: {
          where: { isAnonymous: false },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        comments: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { supporters: true, donations: true, comments: true }
        }
      }
    });

    if (!idea) {
      return res.status(404).json({ error: { message: 'Idea not found' } });
    }

    // Check if current user is supporting this idea
    let isSupporting = false;
    if (req.user && req.user.userId) {
      const support = await prisma.ideaSupport.findUnique({
        where: {
          userId_ideaId: {
            userId: req.user.userId,
            ideaId: idea.id
          }
        }
      });
      isSupporting = !!support;
    }

    res.json({ idea, isSupporting });
  } catch (error) {
    console.error('Error fetching idea:', error);
    res.status(500).json({ error: { message: 'Failed to fetch idea' } });
  }
});

// Create idea
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      title, description, movementId, latitude, longitude, 
      address, fundingGoal, coverImage, images 
    } = req.body;

    if (!title || !description || !movementId || !latitude || !longitude) {
      return res.status(400).json({ 
        error: { message: 'Title, description, movement, and location are required' }
      });
    }

    // Check if user is a member of the movement
    const membership = await prisma.movementMember.findUnique({
      where: {
        userId_movementId: {
          userId: req.user.userId,
          movementId
        }
      }
    });

    // Also check if user is the movement owner (they should be able to add ideas)
    const movement = await prisma.movement.findUnique({
      where: { id: movementId },
      select: { ownerId: true }
    });

    if (!movement) {
      return res.status(404).json({ 
        error: { message: 'Movement not found' }
      });
    }

    const isOwner = movement.ownerId === req.user.userId;

    if (!membership && !isOwner) {
      console.log('User not authorized to add idea:', {
        userId: req.user.userId,
        movementId,
        isOwner,
        hasMembership: !!membership
      });
      return res.status(403).json({ 
        error: { message: 'Must be a member of the movement to add ideas' }
      });
    }

    console.log('Creating idea with data:', {
      title,
      description,
      movementId,
      creatorId: req.user.userId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address,
      fundingGoal: fundingGoal ? parseInt(fundingGoal) : 0
    });

    const idea = await prisma.idea.create({
      data: {
        title,
        description,
        movementId,
        creatorId: req.user.userId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address,
        fundingGoal: fundingGoal ? parseInt(fundingGoal) : 0,
        coverImage,
        images: images || []
      },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        },
        movement: {
          select: { id: true, name: true, ownerId: true }
        },
        _count: {
          select: { supporters: true, donations: true, comments: true }
        }
      }
    });

    console.log('Idea created successfully:', idea.id);

    // Verify the idea was actually saved by querying it back
    try {
      const verifiedIdea = await prisma.idea.findUnique({
        where: { id: idea.id }
      });
      if (!verifiedIdea) {
        console.error('ERROR: Idea was not found after creation!');
        throw new Error('Idea was not saved to database');
      }
      console.log('Idea verified in database:', verifiedIdea.id);
    } catch (verifyError) {
      console.error('Error verifying idea:', verifyError);
      throw verifyError;
    }

    // Create notification (non-blocking - don't fail if this fails)
    try {
      await prisma.notification.create({
        data: {
          userId: idea.movement.ownerId,
          type: 'idea_created',
          title: 'New idea in your movement',
          message: `${idea.creator.firstName} added "${idea.title}"`,
          link: `/ideas/${idea.id}`
        }
      });
      console.log('Notification created for idea:', idea.id);
    } catch (notifError) {
      console.error('Failed to create notification (non-critical):', notifError);
      // Continue anyway - notification failure shouldn't prevent idea creation
    }

    res.status(201).json({ idea });
  } catch (error) {
    console.error('Error creating idea:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: { 
        message: 'Failed to create idea',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      } 
    });
  }
});

// Support idea
router.post('/:id/support', authenticateToken, async (req, res) => {
  try {
    const existing = await prisma.ideaSupport.findUnique({
      where: {
        userId_ideaId: {
          userId: req.user.userId,
          ideaId: req.params.id
        }
      }
    });

    if (existing) {
      await prisma.ideaSupport.delete({
        where: { id: existing.id }
      });
      
      // Get updated supporter count
      const count = await prisma.ideaSupport.count({
        where: { ideaId: req.params.id }
      });
      
      return res.json({ 
        supported: false, 
        message: 'Removed support',
        supporterCount: count
      });
    }

    const support = await prisma.ideaSupport.create({
      data: {
        userId: req.user.userId,
        ideaId: req.params.id
      },
      include: {
        idea: {
          select: { title: true, creatorId: true }
        }
      }
    });

    // Get updated supporter count
    const count = await prisma.ideaSupport.count({
      where: { ideaId: req.params.id }
    });

    // Only send notification if user is not the creator (creators auto-support)
    if (support.idea.creatorId !== req.user.userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: support.idea.creatorId,
            type: 'idea_supported',
            title: 'Someone supported your idea',
            message: `Your idea "${support.idea.title}" got a new supporter`,
            link: `/ideas/${req.params.id}`
          }
        });
      } catch (notifError) {
        console.error('Failed to create notification (non-critical):', notifError);
      }
    }

    res.status(201).json({ 
      supported: true, 
      message: 'Added support',
      supporterCount: count
    });
  } catch (error) {
    console.error('Error supporting idea:', error);
    res.status(500).json({ error: { message: 'Failed to support idea' } });
  }
});

// Add task
router.post('/:id/tasks', authenticateToken, async (req, res) => {
  try {
    const { title, description, order } = req.body;

    const idea = await prisma.idea.findUnique({
      where: { id: req.params.id },
      include: { movement: true }
    });

    if (!idea) {
      return res.status(404).json({ error: { message: 'Idea not found' } });
    }

    const membership = await prisma.movementMember.findUnique({
      where: {
        userId_movementId: {
          userId: req.user.userId,
          movementId: idea.movementId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: { message: 'Not authorized' } });
    }

    const task = await prisma.task.create({
      data: {
        ideaId: req.params.id,
        title,
        description,
        order: order || 0
      }
    });

    res.status(201).json({ task });
  } catch (error) {
    console.error('Error adding task:', error);
    res.status(500).json({ error: { message: 'Failed to add task' } });
  }
});

// Add comment
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: { message: 'Content is required' } });
    }

    const comment = await prisma.comment.create({
      data: {
        userId: req.user.userId,
        ideaId: req.params.id,
        content
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      }
    });

    res.status(201).json({ comment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: { message: 'Failed to add comment' } });
  }
});

module.exports = router;
