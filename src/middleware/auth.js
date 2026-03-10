const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const SECRET = process.env.JWT_SECRET || 'fooli-dev-secret';

const generateToken = (userId) => jwt.sign({ userId }, SECRET, { expiresIn: '30d' });

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token' });
  try {
    const { userId } = jwt.verify(header.split(' ')[1], SECRET);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

module.exports = { authenticate, generateToken };
