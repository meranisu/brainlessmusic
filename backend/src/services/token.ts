import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenUser {
  id: number;
  username: string;
}

export function signToken(user: TokenUser): string {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}
