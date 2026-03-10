const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authenticate, generateToken } = require('../middleware/auth');
const prisma = new PrismaClient();

const safe = (u) => { const { password, ...rest } = u; return rest; };

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'All fields required' });
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ success: false, message: 'Email taken' });
    const user = await prisma.user.create({ data: { name, email, password: await bcrypt.hash(password, 12), points: 1000 } });
    res.status(201).json({ success: true, data: { user: safe(user), token: generateToken(user.id) } });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    res.json({ success: true, data: { user: safe(user), token: generateToken(user.id) } });
  } catch (e) { next(e); }
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { _count: { select: { bets: true, markets: true } } },
  });
  res.json({ success: true, data: { user: safe(user) } });
});

module.exports = router;
