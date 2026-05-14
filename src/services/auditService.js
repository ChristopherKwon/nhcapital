// src/services/auditService.js
const prisma = require('../utils/prisma');

const log = ({ userId, userName, userRole, action, entityType, entityId, entityLabel, oldValues, newValues, ipAddress }) => {
  prisma.auditLog.create({
    data: { userId, userName, userRole, action, entityType, entityId, entityLabel, oldValues, newValues, ipAddress },
  }).catch(err => console.error('[AuditLog Error]', err.message));
};

// req 객체에서 공통 필드 추출
const fromReq = (req) => ({
  userId: req.user?.id || null,
  userName: req.user?.name || null,
  userRole: req.user?.role || null,
  ipAddress: req.ip || req.connection?.remoteAddress || null,
});

module.exports = { log, fromReq };
