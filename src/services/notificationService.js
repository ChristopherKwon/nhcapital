// src/services/notificationService.js
const prisma = require('../utils/prisma');

let io = null;

const setSocketIO = (socketIO) => {
  io = socketIO;
};

const createNotification = async ({ userId, ticketId, type, message }) => {
  const notification = await prisma.notification.create({
    data: { userId, ticketId, type, message },
  });

  if (io) {
    io.to(`user:${userId}`).emit('notification', {
      id: notification.id,
      type,
      message,
      ticketId,
      createdAt: notification.createdAt,
    });
  }

  return notification;
};

module.exports = { setSocketIO, createNotification };
