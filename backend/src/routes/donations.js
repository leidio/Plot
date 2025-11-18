const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// Get donations for an idea
router.get('/idea/:ideaId', async (req, res) => {
  try {
    const donations = await prisma.donation.findMany({
      where: {
        ideaId: req.params.ideaId,
        stripeStatus: 'succeeded'
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedDonations = donations.map(d => ({
      ...d,
      user: d.isAnonymous ? null : d.user
    }));

    res.json({ donations: formattedDonations });
  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({ error: { message: 'Failed to fetch donations' } });
  }
});

// Get user's donation history
router.get('/my-donations', authenticateToken, async (req, res) => {
  try {
    const donations = await prisma.donation.findMany({
      where: {
        userId: req.user.userId,
        stripeStatus: 'succeeded'
      },
      include: {
        idea: {
          select: { id: true, title: true, coverImage: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ donations });
  } catch (error) {
    console.error('Error fetching user donations:', error);
    res.status(500).json({ error: { message: 'Failed to fetch donations' } });
  }
});

module.exports = router;
