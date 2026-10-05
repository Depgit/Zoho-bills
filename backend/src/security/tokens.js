// Login tokens (JWT, 12 hours)
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

export const signToken = (payload) => jwt.sign(payload, JWT_SECRET(), { expiresIn: '12h' });

// The payload, or throws if the token is missing / invalid / expired
export const readToken = (token) => jwt.verify(token, JWT_SECRET());
