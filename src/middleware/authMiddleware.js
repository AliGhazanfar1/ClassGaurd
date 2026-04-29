const jwt = require('jsonwebtoken');
const { User } = require('../models');

exports.protect = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({ error: 'You are not logged in!' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const currentUser = await User.findByPk(decoded.id);
    if (!currentUser) {
      return res.status(401).json({ error: 'The user belonging to this token no longer exists.' });
    }
    
    req.user = currentUser;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
};
