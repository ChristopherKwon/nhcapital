// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const audit = require('../services/auditService');

const login = async (req, res, next) => {
  try {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) {
      return res.status(400).json({ error: '사번과 비밀번호를 입력해주세요.' });
    }

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });

    if (!user || !user.isActive) {
      audit.log({ action: 'LOGIN_FAILED', entityLabel: employeeId, ipAddress: req.ip, newValues: { reason: '존재하지 않거나 비활성 계정' } });
      return res.status(401).json({ error: '사번 또는 비밀번호가 올바르지 않습니다.' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      audit.log({ userId: user.id, userName: user.name, userRole: user.role, action: 'LOGIN_FAILED', ipAddress: req.ip, newValues: { reason: '비밀번호 불일치' } });
      return res.status(401).json({ error: '사번 또는 비밀번호가 올바르지 않습니다.' });
    }

    audit.log({ userId: user.id, userName: user.name, userRole: user.role, action: 'LOGIN', ipAddress: req.ip });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.id,
        employeeId: user.employeeId,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res) => {
  res.json({
    id: req.user.id,
    employeeId: req.user.employeeId,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    department: req.user.department,
  });
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
    }

    const isValid = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    audit.log({ ...audit.fromReq(req), action: 'CHANGE_PASSWORD', entityType: 'USER', entityId: req.user.id, entityLabel: req.user.employeeId });
    res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, me, changePassword };
