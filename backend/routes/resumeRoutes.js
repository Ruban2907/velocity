const express = require('express');
const { parseResumePy } = require('../controllers/resumeController');
const { authenticate } = require('../middleware/auth');
const { resumeLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Requires authentication, rate limiting, and enforces 10MB JSON body limit
router.post(
  '/parse',
  authenticate,
  resumeLimiter,
  express.json({ limit: '10mb' }),
  parseResumePy
);

// Standardize 413 payload too large error response
router.use((err, req, res, next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      message: 'Uploaded file exceeds the maximum allowed size limit of 10MB.'
    });
  }
  next(err);
});

module.exports = router;



