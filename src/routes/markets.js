const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const prisma = new PrismaClient();

// GET /api/markets
router.get('/', async (req, res, next) => {
  try {
    const { sort = 'trending', category, search, limit = 50 } = req.query;
    const where = {};
    if (category) where.category = category;
    if (search) where.question = { contains: search, mode: 'insensitive' };
    if (sort === 'resolved') where.status = 'RESOLVED';
    else if (sort !== 'all') where.status = { not: 'RESOLVED' };

    let orderBy;
    if (sort === 'trending') orderBy = [{ totalYes: 'desc' }, { totalNo: 'desc' }];
    else if (sort === 'newest') orderBy = { createdAt: 'desc' };
    else orderBy = { createdAt: 'desc' };

    const markets = await prisma.market.findMany({
      where, orderBy, take: Number(limit),
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { bets: true } },
      },
    });
    res.json({ success: true, data: { markets } });
  } catch (e) { next(e); }
});

// GET /api/markets/:id
router.get('/:id', async (req, res, next) => {
  try {
    const market = await prisma.market.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true } },
        bets: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: { select: { id: true, name: true } } },
        },
        _count: { select: { bets: true } },
      },
    });
    if (!market) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: { market } });
  } catch (e) { next(e); }
});

// POST /api/markets
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { question, description, category, closesAt } = req.body;
    if (!question || !closesAt) return res.status(400).json({ success: false, message: 'Question and closing date required' });
    const market = await prisma.market.create({
      data: {
        userId: req.user.id, question, description, category: category || 'other',
        closesAt: new Date(closesAt),
      },
      include: { user: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: { market } });
  } catch (e) { next(e); }
});

// POST /api/markets/:id/bet
router.post('/:id/bet', authenticate, async (req, res, next) => {
  try {
    const { side, amount } = req.body;
    if (!['YES', 'NO'].includes(side)) return res.status(400).json({ success: false, message: 'Side must be YES or NO' });
    if (!amount || amount < 10) return res.status(400).json({ success: false, message: 'Minimum bet is 10' });

    const market = await prisma.market.findUnique({ where: { id: req.params.id } });
    if (!market) return res.status(404).json({ success: false, message: 'Market not found' });
    if (market.status !== 'OPEN') return res.status(400).json({ success: false, message: 'Market is not open' });
    if (new Date(market.closesAt) < new Date()) return res.status(400).json({ success: false, message: 'Market is closed' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user.points < amount) return res.status(400).json({ success: false, message: 'Not enough points' });

    // Transaction: deduct points + create bet + update market totals
    const [bet, updatedUser] = await prisma.$transaction([
      prisma.bet.create({
        data: { userId: req.user.id, marketId: market.id, side, amount },
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.user.update({ where: { id: req.user.id }, data: { points: { decrement: amount } } }),
      prisma.market.update({
        where: { id: market.id },
        data: side === 'YES' ? { totalYes: { increment: amount } } : { totalNo: { increment: amount } },
      }),
    ]);

    const { password, ...safeUser } = updatedUser;
    res.json({ success: true, data: { bet, user: safeUser } });
  } catch (e) { next(e); }
});

// POST /api/markets/:id/resolve
router.post('/:id/resolve', authenticate, async (req, res, next) => {
  try {
    const { outcome } = req.body;
    if (!['YES', 'NO'].includes(outcome)) return res.status(400).json({ success: false, message: 'Outcome must be YES or NO' });

    const market = await prisma.market.findUnique({ where: { id: req.params.id } });
    if (!market) return res.status(404).json({ success: false, message: 'Not found' });
    if (market.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Only creator can resolve' });
    if (market.status === 'RESOLVED') return res.status(400).json({ success: false, message: 'Already resolved' });

    // Get all bets
    const bets = await prisma.bet.findMany({ where: { marketId: market.id } });
    const totalPool = market.totalYes + market.totalNo;
    const winningSide = outcome;
    const winningPool = winningSide === 'YES' ? market.totalYes : market.totalNo;

    // Pay out winners proportionally from total pool
    const updates = [];
    for (const bet of bets) {
      if (bet.side === winningSide && winningPool > 0) {
        const payout = Math.round((bet.amount / winningPool) * totalPool);
        updates.push(
          prisma.user.update({ where: { id: bet.userId }, data: { points: { increment: payout }, wins: { increment: 1 } } }),
          prisma.bet.update({ where: { id: bet.id }, data: { payout } })
        );
      }
    }

    updates.push(
      prisma.market.update({ where: { id: market.id }, data: { status: 'RESOLVED', outcome, resolvedAt: new Date() } })
    );

    await prisma.$transaction(updates);

    const updated = await prisma.market.findUnique({ where: { id: market.id } });
    res.json({ success: true, data: { market: updated } });
  } catch (e) { next(e); }
});

module.exports = router;
