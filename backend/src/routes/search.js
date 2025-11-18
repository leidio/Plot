const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// Global search
router.get('/', async (req, res) => {
  try {
    const { q, type } = req.query;

    if (!q) {
      return res.status(400).json({ error: { message: 'Query required' } });
    }

    const results = {};

    if (!type || type === 'movements') {
      const where = { isActive: true };
      
      // Parse query to check for location patterns (e.g., "Detroit, MI" or "Detroit")
      const locationMatch = q.match(/^([^,]+)(?:,\s*([A-Z]{2}|[A-Za-z\s]+))?$/);
      const searchTerms = q.toLowerCase().trim();
      
      // Build search conditions
      const searchConditions = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { hasSome: [searchTerms] } }
      ];
      
      // If it looks like a location, add location search
      if (locationMatch) {
        const city = locationMatch[1].trim();
        const state = locationMatch[2]?.trim();
        
        if (state) {
          // Full location: "City, State"
          searchConditions.push(
            { city: { contains: city, mode: 'insensitive' } },
            { state: { contains: state, mode: 'insensitive' } }
          );
        } else {
          // Just city name
          searchConditions.push(
            { city: { contains: city, mode: 'insensitive' } }
          );
        }
      } else {
        // Regular search - also check city and state fields
        searchConditions.push(
          { city: { contains: q, mode: 'insensitive' } },
          { state: { contains: q, mode: 'insensitive' } }
        );
      }
      
      where.OR = searchConditions;

      results.movements = await prisma.movement.findMany({
        where,
        take: 50,
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
    }

    if (!type || type === 'ideas') {
      results.ideas = await prisma.idea.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } }
          ]
        },
        take: 50,
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
    }

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: { message: 'Search failed' } });
  }
});

module.exports = router;
