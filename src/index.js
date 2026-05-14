// src/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const errorHandler = require('./middlewares/errorHandler');
const { setSocketIO } = require('./services/notificationService');

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const commonRoutes = require('./routes/common');
const testRoutes = require('./routes/tests');
const collaborationRoutes = require('./routes/collaboration');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// 미들웨어
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
// JS/HTML은 캐시 없이 항상 최신 버전 서빙
app.use('/js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, '../public'), { etag: false }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API 라우터
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/common', commonRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/collab', collaborationRoutes);

// 프론트엔드 라우팅 (SPA)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 에러 핸들러
app.use(errorHandler);

// Socket.io 인증 미들웨어
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('인증이 필요합니다.'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch {
    next(new Error('유효하지 않은 토큰입니다.'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);

  socket.on('disconnect', () => {
    socket.leave(`user:${socket.userId}`);
  });
});

setSocketIO(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ITSM 서버 실행 중: http://localhost:${PORT}`);
});

module.exports = { app, server };
