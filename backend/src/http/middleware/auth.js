import { readToken } from '../../security/tokens.js';

// auth() = any logged-in user; auth('FM', 'ADMIN') = only those roles
export const auth =
  (...roles) =>
  (req, res, next) => {
    try {
      req.user = readToken((req.headers.authorization || '').replace('Bearer ', ''));
    } catch {
      return res.status(401).json({ error: 'Your session has expired — please sign in again' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You are not allowed to do this' });
    }
    next();
  };
