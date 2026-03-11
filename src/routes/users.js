const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/users/:id/badges
router.get('/:id/badges', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const badges = await prisma.badge.findMany({
      where: { userId: req.params.id },
      orderBy: { earnedAt: 'desc' },
    });
    res.json({ success: true, data: { badges } });
  } catch (e) { next(e); }
});

module.exports = router;
