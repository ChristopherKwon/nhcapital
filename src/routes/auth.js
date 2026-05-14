// src/routes/auth.js
const router = require('express').Router();
const { login, me, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

router.post('/login', login);
router.get('/me', authenticate, me);
router.patch('/password', authenticate, changePassword);

module.exports = router;
