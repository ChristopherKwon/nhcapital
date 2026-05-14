// src/middlewares/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: '데이터를 찾을 수 없습니다.' });
  }

  if (err.code === 'P2002') {
    return res.status(409).json({ error: '이미 존재하는 데이터입니다.' });
  }

  res.status(err.status || 500).json({
    error: err.message || '서버 오류가 발생했습니다.',
  });
};

module.exports = errorHandler;
