const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// Helper to get Socket.IO instance
const getIO = (req) => {
  return req.app.get('io');
};

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
    const userId = req.user?.userId;
    
    // Fetch idea with optimized includes
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
          take: 20, // Limit to first 20 supporters for display
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        tasks: {
          orderBy: { order: 'asc' },
          include: {
            claimedUser: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          }
        },
        needs: true,
        donations: {
          where: { isAnonymous: false },
          take: 20, // Limit to most recent 20 donations
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        comments: {
          take: 50, // Limit to most recent 50 comments
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

    // Check if current user is supporting this idea (optimized - single query)
    let isSupporting = false;
    if (userId) {
      // Use count instead of findUnique for better performance
      const supportCount = await prisma.ideaSupport.count({
        where: {
          userId: userId,
          ideaId: idea.id
        }
      });
      isSupporting = supportCount > 0;
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

    // Emit real-time event for new idea
    const io = getIO(req);
    if (io) {
      io.to(`movement:${movementId}`).emit('idea:created', {
        idea: {
          ...idea,
          creator: idea.creator,
          movement: idea.movement,
          _count: idea._count
        }
      });
      
      // Also emit to all users for global updates
      io.emit('movement:updated', {
        movementId,
        type: 'idea_added',
        ideaId: idea.id
      });
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

// Update idea (only creator can update)
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const ideaId = req.params.id;
    const { images, coverImage } = req.body;

    // Check if idea exists and user is the creator
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: { creatorId: true }
    });

    if (!idea) {
      return res.status(404).json({ error: { message: 'Idea not found' } });
    }

    if (idea.creatorId !== req.user.userId) {
      return res.status(403).json({ error: { message: 'Only the idea creator can update it' } });
    }

    // Build update data
    const updateData = {};
    if (images !== undefined) updateData.images = images;
    if (coverImage !== undefined) updateData.coverImage = coverImage;

    const updatedIdea = await prisma.idea.update({
      where: { id: ideaId },
      data: updateData,
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, avatar: true, bio: true }
        },
        movement: {
          select: { id: true, name: true, ownerId: true }
        },
        supporters: {
          take: 20,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        tasks: {
          orderBy: { order: 'asc' },
          include: {
            claimedUser: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          }
        },
        needs: true,
        donations: {
          where: { isAnonymous: false },
          take: 20,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        comments: {
          take: 50,
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

    // Check if current user is supporting this idea
    const supportCount = await prisma.ideaSupport.count({
      where: {
        userId: req.user.userId,
        ideaId: updatedIdea.id
      }
    });
    const isSupporting = supportCount > 0;

    res.json({ idea: updatedIdea, isSupporting });
  } catch (error) {
    console.error('Error updating idea:', error);
    res.status(500).json({ error: { message: 'Failed to update idea' } });
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
      
      // Emit real-time event
      const io = getIO(req);
      if (io) {
        // Get movement ID for the idea
        const idea = await prisma.idea.findUnique({
          where: { id: req.params.id },
          select: { movementId: true }
        });
        if (idea) {
          io.to(`movement:${idea.movementId}`).emit('idea:supported', {
            ideaId: req.params.id,
            supported: false,
            supporterCount: count,
            userId: req.user.userId
          });
        }
      }
      
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

    // Emit real-time event
    const io = getIO(req);
    if (io) {
      // Get movement ID for the idea
      const idea = await prisma.idea.findUnique({
        where: { id: req.params.id },
        select: { movementId: true }
      });
      if (idea) {
        io.to(`movement:${idea.movementId}`).emit('idea:supported', {
          ideaId: req.params.id,
          supported: true,
          supporterCount: count,
          userId: req.user.userId
        });
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

// Add task (only idea creator)
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

    // Only idea creator can add tasks
    if (idea.creatorId !== req.user.userId) {
      return res.status(403).json({ error: { message: 'Only the idea creator can add tasks' } });
    }

    const task = await prisma.task.create({
      data: {
        ideaId: req.params.id,
        title,
        description,
        order: order || 0
      },
      include: {
        claimedUser: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      }
    });

    // Emit real-time event for activity feed
    const io = getIO(req);
    if (io) {
      const idea = await prisma.idea.findUnique({
        where: { id: req.params.id },
        select: { movementId: true }
      });
      if (idea) {
        io.to(`movement:${idea.movementId}`).emit('idea:activity', {
          ideaId: req.params.id,
          type: 'task_created',
          activity: {
            id: `task-created-${task.id}`,
            type: 'task_created',
            user: null,
            task: {
              id: task.id,
              title: task.title
            },
            createdAt: task.createdAt
          }
        });
      }
    }

    res.status(201).json({ task });
  } catch (error) {
    console.error('Error adding task:', error);
    res.status(500).json({ 
      error: { 
        message: error.message || 'Failed to add task',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      } 
    });
  }
});

// Update task (only idea creator)
router.put('/:ideaId/tasks/:taskId', authenticateToken, async (req, res) => {
  try {
    const { ideaId, taskId } = req.params;
    const { title, description, order } = req.body;

    const idea = await prisma.idea.findUnique({
      where: { id: ideaId }
    });

    if (!idea) {
      return res.status(404).json({ error: { message: 'Idea not found' } });
    }

    // Only idea creator can update tasks
    if (idea.creatorId !== req.user.userId) {
      return res.status(403).json({ error: { message: 'Only the idea creator can update tasks' } });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task || task.ideaId !== ideaId) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order })
      },
      include: {
        claimedUser: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      }
    });

    // Emit real-time event for activity feed
    const io = getIO(req);
    if (io) {
      const idea = await prisma.idea.findUnique({
        where: { id: ideaId },
        select: { movementId: true }
      });
      if (idea) {
        io.to(`movement:${idea.movementId}`).emit('idea:activity', {
          ideaId: ideaId,
          type: 'task_updated',
          activity: {
            id: `task-updated-${taskId}`,
            type: 'task_updated',
            user: null,
            task: {
              id: taskId,
              title: updatedTask.title
            },
            createdAt: updatedTask.updatedAt || new Date()
          }
        });
      }
    }

    res.json({ task: updatedTask });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: { message: 'Failed to update task' } });
  }
});

// Delete task (only idea creator)
router.delete('/:ideaId/tasks/:taskId', authenticateToken, async (req, res) => {
  try {
    const { ideaId, taskId } = req.params;

    const idea = await prisma.idea.findUnique({
      where: { id: ideaId }
    });

    if (!idea) {
      return res.status(404).json({ error: { message: 'Idea not found' } });
    }

    // Only idea creator can delete tasks
    if (idea.creatorId !== req.user.userId) {
      return res.status(403).json({ error: { message: 'Only the idea creator can delete tasks' } });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task || task.ideaId !== ideaId) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    await prisma.task.delete({
      where: { id: taskId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: { message: 'Failed to delete task' } });
  }
});

// Claim task
router.post('/:ideaId/tasks/:taskId/claim', authenticateToken, async (req, res) => {
  try {
    const { ideaId, taskId } = req.params;

    // Verify the task belongs to the idea
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { idea: true }
    });

    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    if (task.ideaId !== ideaId) {
      return res.status(400).json({ error: { message: 'Task does not belong to this idea' } });
    }

    // Check if task is already claimed by someone else
    if (task.claimedBy && task.claimedBy !== req.user.userId) {
      return res.status(409).json({ error: { message: 'Task is already claimed by another user' } });
    }

    // Claim the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        claimedBy: req.user.userId,
        claimedAt: new Date()
      },
      include: {
        claimedUser: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      }
    });

    // Emit real-time event for activity feed
    const io = getIO(req);
    if (io) {
      const idea = await prisma.idea.findUnique({
        where: { id: ideaId },
        select: { movementId: true }
      });
      if (idea) {
        io.to(`movement:${idea.movementId}`).emit('idea:activity', {
          ideaId: ideaId,
          type: 'task_claimed',
          activity: {
            id: `task-claimed-${taskId}`,
            type: 'task_claimed',
            user: updatedTask.claimedUser,
            task: {
              id: taskId,
              title: updatedTask.title
            },
            createdAt: updatedTask.claimedAt || new Date()
          }
        });
      }
    }

    res.json({ task: updatedTask });
  } catch (error) {
    console.error('Error claiming task:', error);
    res.status(500).json({ error: { message: 'Failed to claim task' } });
  }
});

// Unclaim task
router.post('/:ideaId/tasks/:taskId/unclaim', authenticateToken, async (req, res) => {
  try {
    const { ideaId, taskId } = req.params;

    // Verify the task belongs to the idea
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { idea: true }
    });

    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    if (task.ideaId !== ideaId) {
      return res.status(400).json({ error: { message: 'Task does not belong to this idea' } });
    }

    // Check if task is claimed by the current user
    if (!task.claimedBy || task.claimedBy !== req.user.userId) {
      return res.status(403).json({ error: { message: 'You can only unclaim tasks you have claimed' } });
    }

    // Unclaim the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        claimedBy: null,
        claimedAt: null
      },
      include: {
        claimedUser: null
      }
    });

    res.json({ task: updatedTask });
  } catch (error) {
    console.error('Error unclaiming task:', error);
    res.status(500).json({ error: { message: 'Failed to unclaim task' } });
  }
});

// Delete idea (only idea creator)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const idea = await prisma.idea.findUnique({
      where: { id: req.params.id }
    });

    if (!idea) {
      return res.status(404).json({ error: { message: 'Idea not found' } });
    }

    // Only idea creator can delete
    if (idea.creatorId !== req.user.userId) {
      return res.status(403).json({ error: { message: 'Only the idea creator can delete this idea' } });
    }

    await prisma.idea.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Idea deleted successfully' });
  } catch (error) {
    console.error('Error deleting idea:', error);
    res.status(500).json({ error: { message: 'Failed to delete idea' } });
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

    // Emit real-time event for activity feed
    const io = getIO(req);
    if (io) {
      const idea = await prisma.idea.findUnique({
        where: { id: req.params.id },
        select: { movementId: true }
      });
      if (idea) {
        io.to(`movement:${idea.movementId}`).emit('idea:activity', {
          ideaId: req.params.id,
          type: 'comment',
          activity: {
            id: comment.id,
            type: 'comment',
            user: comment.user,
            content: comment.content,
            createdAt: comment.createdAt
          }
        });
      }
    }

    res.status(201).json({ comment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: { message: 'Failed to add comment' } });
  }
});

// Get activity feed for an idea
router.get('/:id/activities', optionalAuth, async (req, res) => {
  try {
    const ideaId = req.params.id;
    const limit = parseInt(req.query.limit) || 50;

    // Verify idea exists
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: { id: true }
    });

    if (!idea) {
      return res.status(404).json({ error: { message: 'Idea not found' } });
    }

    // Fetch all activities
    const [tasks, supporters, donations, comments] = await Promise.all([
      // Tasks - created, claimed, updated
      prisma.task.findMany({
        where: { ideaId },
        include: {
          claimedUser: {
            select: { id: true, firstName: true, lastName: true, avatar: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      // Supporters
      prisma.ideaSupport.findMany({
        where: { ideaId },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      // Donations
      prisma.donation.findMany({
        where: { ideaId, isAnonymous: false },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      // Comments
      prisma.comment.findMany({
        where: { ideaId },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Build activity feed
    const activities = [];

    // Add task activities
    tasks.forEach(task => {
      // Task created
      activities.push({
        id: `task-created-${task.id}`,
        type: 'task_created',
        user: null, // Task creator is the idea creator
        task: {
          id: task.id,
          title: task.title
        },
        createdAt: task.createdAt
      });

      // Task claimed
      if (task.claimedAt && task.claimedUser) {
        activities.push({
          id: `task-claimed-${task.id}`,
          type: 'task_claimed',
          user: task.claimedUser,
          task: {
            id: task.id,
            title: task.title
          },
          createdAt: task.claimedAt
        });
      }

      // Task updated (if updatedAt is different from createdAt)
      if (task.updatedAt && task.updatedAt.getTime() !== task.createdAt.getTime()) {
        activities.push({
          id: `task-updated-${task.id}`,
          type: 'task_updated',
          user: null,
          task: {
            id: task.id,
            title: task.title
          },
          createdAt: task.updatedAt
        });
      }
    });

    // Add supporter activities
    supporters.forEach(support => {
      activities.push({
        id: `support-${support.id}`,
        type: 'support',
        user: support.user,
        createdAt: support.createdAt
      });
    });

    // Add donation activities
    donations.forEach(donation => {
      activities.push({
        id: `donation-${donation.id}`,
        type: 'donation',
        user: donation.user,
        donation: {
          id: donation.id,
          amount: donation.amount
        },
        createdAt: donation.createdAt
      });
    });

    // Add comment activities
    comments.forEach(comment => {
      activities.push({
        id: `comment-${comment.id}`,
        type: 'comment',
        user: comment.user,
        comment: {
          id: comment.id,
          content: comment.content.substring(0, 100) // Preview
        },
        createdAt: comment.createdAt
      });
    });

    // Sort by date (newest first) and limit
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const limitedActivities = activities.slice(0, limit);

    res.json({ activities: limitedActivities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: { message: 'Failed to fetch activities' } });
  }
});

module.exports = router;
