const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  try {
    // Check cookie first, then fall back to Authorization header for backward compatibility
    const token = req.cookies.authToken || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) {
      console.log('No token found. Cookies:', req.cookies, 'Auth header:', req.headers['authorization']);
      return res.status(401).json({ 
        error: { message: 'Access token required' }
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.log('Token verification failed:', err.message);
        return res.status(403).json({ 
          error: { message: 'Invalid or expired token' }
        });
      }

      console.log('Authentication successful. User ID:', decoded.userId);
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ 
      error: { message: 'Authentication error' }
    });
  }
};

const optionalAuth = (req, res, next) => {
  try {
    // Check cookie first, then fall back to Authorization header
    const token = req.cookies.authToken || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (token) {
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (!err) {
          req.user = decoded;
        }
      });
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};
