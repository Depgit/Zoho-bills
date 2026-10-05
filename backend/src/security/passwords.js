// Password hashing (bcrypt)
import bcrypt from 'bcryptjs';

export const hashPassword = (plain) => bcrypt.hash(plain, 10);

export const checkPassword = (plain, hash) => (hash ? bcrypt.compare(plain || '', hash) : Promise.resolve(false));
