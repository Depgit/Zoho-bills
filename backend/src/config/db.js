import mongoose from 'mongoose';
import { MONGO_URI } from './env.js';

export const connectDb = () => mongoose.connect(MONGO_URI);

// 'connected' | 'connecting' | 'disconnected' | 'disconnecting'
export const dbState = () =>
  ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
