const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const prisma = new PrismaClient();

// GET /api/markets/:id/comments
router.get('/', async (req, res, next) => {
  try {
    const market = await prisma.market.findUnique({ where: { id: req.params.id } });
    if (!market) return res.status(404).json({ success: false, message: 'Market not found' });

    const comments = await prisma.comment.findMany({
      where: { marketId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true } } },
    });
    res.json({ success: true, data: { comments } });
  } catch (e) { next(e); }
});

// POST /api/markets/:id/comments
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'Text is required' });

    const market = await prisma.market.findUnique({ where: { id: req.params.id } });
    if (!market) return res.status(404).json({ success: false, message: 'Market not found' });

    const comment = await prisma.comment.create({
      data: { userId: req.user.id, marketId: req.params.id, text: text.trim() },
      include: { user: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: { comment } });
  } catch (e) { next(e); }
});

module.exports = router;
