import { Request, Response, NextFunction } from 'express';
import { isValidToken } from '../utils/storage';

export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  // Debug logging
  console.log('Auth check for token:', token?.substring(0, 10) + '...');
  
  if (!token || !isValidToken(token)) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }
  
  next();
};