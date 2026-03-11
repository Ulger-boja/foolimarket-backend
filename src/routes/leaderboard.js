const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/leaderboard — all-time leaderboard by points
router.get('/', async (req, res, next) => {
  try {
    const leaderboard = await prisma.user.findMany({
      orderBy: { points: 'desc' },
      take: 50,
      select: {
        id: true, name: true, points: true, wins: true,
        currentStreak: true, bestStreak: true, createdAt: true,
        _count: { select: { bets: true, markets: true } },
      },
    });
    res.json({ success: true, data: { leaderboard } });
  } catch (e) { next(e); }
});

// GET /api/leaderboard/weekly — top earners in last 7 days by sum of bet payouts
router.get('/weekly', async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const winningBets = await prisma.bet.findMany({
      where: {
        payout: { gt: 0 },
        market: { status: 'RESOLVED', resolvedAt: { gte: sevenDaysAgo } },
      },
      select: {
        userId: true,
        payout: true,
        user: { select: { id: true, name: true, points: true } },
      },
    });

    const byUser = {};
    for (const bet of winningBets) {
      if (!byUser[bet.userId]) byUser[bet.userId] = { user: bet.user, totalPayout: 0 };
      byUser[bet.userId].totalPayout += bet.payout;
    }

    const leaderboard = Object.values(byUser)
      .sort((a, b) => b.totalPayout - a.totalPayout)
      .slice(0, 50);

    res.json({ success: true, data: { leaderboard, since: sevenDaysAgo } });
  } catch (e) { next(e); }
});

// GET /api/leaderboard/shame — most losses in last 7 days
router.get('/shame', async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const losingBets = await prisma.bet.findMany({
      where: {
        payout: 0,
        market: { status: 'RESOLVED', resolvedAt: { gte: sevenDaysAgo } },
      },
      select: {
        userId: true,
        amount: true,
        user: { select: { id: true, name: true } },
      },
    });

    const byUser = {};
    for (const bet of losingBets) {
      if (!byUser[bet.userId]) byUser[bet.userId] = { user: bet.user, losses: 0, pointsLost: 0 };
      byUser[bet.userId].losses += 1;
      byUser[bet.userId].pointsLost += bet.amount;
    }

    const shameWall = Object.values(byUser)
      .sort((a, b) => b.losses - a.losses)
      .slice(0, 50);

    res.json({ success: true, data: { shameWall, since: sevenDaysAgo } });
  } catch (e) { next(e); }
});

module.exports = router;
