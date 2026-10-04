import jwt from 'jsonwebtoken';

// auth() = any logged-in user; auth('FM', 'ADMIN') = only those roles
export const auth = (...roles) => (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
  } catch { return res.status(401).json({ error: 'Your session has expired — please sign in again' }); }
  if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'You are not allowed to do this' });
  next();
};

// Error with an HTTP status, thrown from route helpers: throw httpError(400, '...')
export const httpError = (status, message) => Object.assign(new Error(message), { status });

// Wrap async route handlers so thrown errors reach the JSON error handler in server.js
export const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
