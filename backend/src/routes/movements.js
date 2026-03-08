const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

/** Validate GeoJSON polygon and return { centroid: [lng, lat], bbox: [minLng, minLat, maxLng, maxLat] } or null. */
function parseBoundary(boundary) {
  if (!boundary || typeof boundary !== 'object') return null;
  const coords = boundary.coordinates || boundary;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const ring = Array.isArray(coords[0]) && typeof coords[0][0] === 'number' ? coords : coords[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let sumLng = 0, sumLat = 0, n = 0;
  for (const p of ring) {
    const [lng, lat] = Array.isArray(p) ? p : [p?.lng ?? p?.x, p?.lat ?? p?.y];
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    sumLng += lng; sumLat += lat; n++;
  }
  return {
    centroid: [sumLng / n, sumLat / n],
    bbox: [minLng, minLat, maxLng, maxLat],
    coordinates: coords
  };
}

// Helper to get Socket.IO instance
const getIO = (req) => {
  return req.app.get('io');
};

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
          take: 50, // Limit members to first 50
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          },
          orderBy: { joinedAt: 'desc' }
        },
        ideas: {
          take: 100, // Limit ideas to first 100
          include: {
            creator: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            },
            _count: {
              select: { supporters: true, donations: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { members: true, ideas: true }
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
    const { name, description, latitude, longitude, city, state, tags, coverImage, boundary } = req.body;

    if (!name || !description || !city || !state) {
      return res.status(400).json({
        error: { message: 'Name, description, city, and state are required' }
      });
    }

    let lat;
    let lng;
    let boundaryData = null;
    let boundaryBboxData = null;

    const parsed = parseBoundary(boundary);
    if (parsed) {
      lat = parsed.centroid[1];
      lng = parsed.centroid[0];
      boundaryData = { coordinates: parsed.coordinates };
      boundaryBboxData = parsed.bbox;
    } else {
      if (latitude == null || longitude == null) {
        return res.status(400).json({
          error: { message: 'Either a location (latitude/longitude) or a valid boundary polygon is required' }
        });
      }
      lat = parseFloat(latitude);
      lng = parseFloat(longitude);
    }

    const movement = await prisma.movement.create({
      data: {
        name,
        description,
        latitude: lat,
        longitude: lng,
        city,
        state,
        tags: tags || [],
        coverImage,
        boundary: boundaryData,
        boundaryBbox: boundaryBboxData,
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

    // Emit real-time event
    const io = getIO(req);
    if (io) {
      io.to(`movement:${req.params.id}`).emit('movement:member_joined', {
        movementId: req.params.id,
        userId: req.user.userId
      });
      io.emit('movement:updated', {
        movementId: req.params.id,
        type: 'member_joined'
      });
    }

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
