const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const prisma = new PrismaClient();

// POST /api/challenges — create a new challenge
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { targetId, question, amount, creatorSide } = req.body;
    if (!targetId || !question || !amount || !creatorSide) {
      return res.status(400).json({ success: false, message: 'targetId, question, amount, creatorSide required' });
    }
    if (!['YES', 'NO'].includes(creatorSide)) {
      return res.status(400).json({ success: false, message: 'creatorSide must be YES or NO' });
    }
    if (amount < 10) {
      return res.status(400).json({ success: false, message: 'Minimum challenge amount is 10' });
    }
    if (targetId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot challenge yourself' });
    }

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ success: false, message: 'Target user not found' });

    const creator = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (creator.points < amount) {
      return res.status(400).json({ success: false, message: 'Not enough points' });
    }

    const [challenge] = await prisma.$transaction([
      prisma.challenge.create({
        data: { creatorId: req.user.id, targetId, question, amount, creatorSide },
        include: {
          creator: { select: { id: true, name: true } },
          target: { select: { id: true, name: true } },
        },
      }),
      prisma.user.update({ where: { id: req.user.id }, data: { points: { decrement: amount } } }),
    ]);

    res.status(201).json({ success: true, data: { challenge } });
  } catch (e) { next(e); }
});

// POST /api/challenges/:id/accept
router.post('/:id/accept', authenticate, async (req, res, next) => {
  try {
    const challenge = await prisma.challenge.findUnique({
      where: { id: req.params.id },
      include: {
        creator: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
      },
    });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.targetId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the target can accept' });
    }
    if (challenge.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Challenge is not pending' });
    }

    const target = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (target.points < challenge.amount) {
      return res.status(400).json({ success: false, message: 'Not enough points' });
    }

    const [updated] = await prisma.$transaction([
      prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: 'ACCEPTED' },
        include: {
          creator: { select: { id: true, name: true } },
          target: { select: { id: true, name: true } },
        },
      }),
      prisma.user.update({ where: { id: req.user.id }, data: { points: { decrement: challenge.amount } } }),
    ]);

    res.json({ success: true, data: { challenge: updated } });
  } catch (e) { next(e); }
});

// POST /api/challenges/:id/decline
router.post('/:id/decline', authenticate, async (req, res, next) => {
  try {
    const challenge = await prisma.challenge.findUnique({ where: { id: req.params.id } });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.targetId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the target can decline' });
    }
    if (challenge.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Challenge is not pending' });
    }

    // Refund creator
    const [updated] = await prisma.$transaction([
      prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: 'DECLINED' },
        include: {
          creator: { select: { id: true, name: true } },
          target: { select: { id: true, name: true } },
        },
      }),
      prisma.user.update({ where: { id: challenge.creatorId }, data: { points: { increment: challenge.amount } } }),
    ]);

    res.json({ success: true, data: { challenge: updated } });
  } catch (e) { next(e); }
});

// POST /api/challenges/:id/resolve — creator resolves
router.post('/:id/resolve', authenticate, async (req, res, next) => {
  try {
    const { outcome } = req.body;
    if (!['YES', 'NO'].includes(outcome)) {
      return res.status(400).json({ success: false, message: 'Outcome must be YES or NO' });
    }

    const challenge = await prisma.challenge.findUnique({ where: { id: req.params.id } });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.creatorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the creator can resolve' });
    }
    if (challenge.status !== 'ACCEPTED') {
      return res.status(400).json({ success: false, message: 'Challenge must be accepted before resolving' });
    }

    const totalPool = challenge.amount * 2;
    const creatorWins = challenge.creatorSide === outcome;
    const winnerId = creatorWins ? challenge.creatorId : challenge.targetId;

    const [updated] = await prisma.$transaction([
      prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: 'RESOLVED', outcome, resolvedAt: new Date() },
        include: {
          creator: { select: { id: true, name: true } },
          target: { select: { id: true, name: true } },
        },
      }),
      prisma.user.update({
        where: { id: winnerId },
        data: { points: { increment: totalPool }, wins: { increment: 1 } },
      }),
    ]);

    res.json({ success: true, data: { challenge: updated } });
  } catch (e) { next(e); }
});

// GET /api/challenges — list challenges for current user
router.get('/', authenticate, async (req, res, next) => {
  try {
    const challenges = await prisma.challenge.findMany({
      where: {
        OR: [{ creatorId: req.user.id }, { targetId: req.user.id }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
      },
    });
    res.json({ success: true, data: { challenges } });
  } catch (e) { next(e); }
});

module.exports = router;
