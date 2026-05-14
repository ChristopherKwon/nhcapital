// src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { department: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
