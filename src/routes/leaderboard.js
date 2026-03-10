const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res, next) => {
  try {
    const leaderboard = await prisma.user.findMany({
      orderBy: { points: 'desc' },
      take: 50,
      select: {
        id: true, name: true, points: true, wins: true, createdAt: true,
        _count: { select: { bets: true, markets: true } },
      },
    });
    res.json({ success: true, data: { leaderboard } });
  } catch (e) { next(e); }
});

module.exports = router;
