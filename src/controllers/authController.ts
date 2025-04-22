import { Request, Response } from 'express';
import crypto from 'crypto';
import * as webAuthn from '../utils/webAuthn';
import { users, storeToken } from '../utils/storage';

/**
 * Register a new user with WebAuthn
 */
export const register = async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
      }
      
      // Check if user already exists
      if (users.has(username)) {
        return res.status(409).json({ success: false, message: 'User already exists' });
      }
      
      // Generate random user ID
      const userId = crypto.randomBytes(16).toString('hex');
      
      // Create new user
      users.set(username, { id: userId, username });
      
      // Generate registration options
      const options = await webAuthn.generateRegOptions(userId, username);
      
      return res.status(200).json({
        success: true,
        message: 'Registration options generated',
        data: options,
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error generating registration options',
      });
    }
  };

/**
 * Verify WebAuthn registration response
 */
export const verifyRegistration = async (req: Request, res: Response) => {
  try {
    const { username, registrationResponse } = req.body;
    
    if (!username || !registrationResponse) {
      return res.status(400).json({ success: false, message: 'Username and registration response are required' });
    }
    
    const user = users.get(username);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Verify registration response
    const verification = await webAuthn.verifyRegResponse(user.id, registrationResponse);
    
    if (!verification.verified) {
      return res.status(400).json({ success: false, message: 'Registration verification failed' });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Registration successful',
    });
  } catch (error) {
    console.error('Registration verification error:', error);
    return res.status(500).json({
      success: false, 
      message: 'Error verifying registration',
    });
  }
};

/**
 * Generate authentication options for login
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }
    
    const user = users.get(username);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Generate authentication options
    const options = await webAuthn.generateAuthOptions(user.id);
    
    return res.status(200).json({
      success: true,
      message: 'Authentication options generated',
      data: options,
    });
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating authentication options',
    });
  }
};

/**
 * Verify WebAuthn authentication response
 */
export const verifyAuthentication = async (req: Request, res: Response) => {
    try {
      const { username, authenticationResponse } = req.body;
      
      if (!username || !authenticationResponse) {
        return res.status(400).json({ success: false, message: 'Username and authentication response are required' });
      }
      
      const user = users.get(username);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      // Verify authentication response
      const verification = await webAuthn.verifyAuthResponse(user.id, authenticationResponse);
      
      if (!verification.verified) {
        return res.status(400).json({ success: false, message: 'Authentication verification failed' });
      }
      
      // Generate a session token
      const token = crypto.randomBytes(32).toString('hex');
      
      // Store token for validation
      storeToken(token);
      
      // Debug output to see the registered user
      console.log('Successfully authenticated user:', username);
      console.log('Current users in storage:', Array.from(users.keys()));
      
      return res.status(200).json({
        success: true,
        message: 'Authentication successful',
        token,
        username,
      });
    } catch (error) {
      console.error('Authentication verification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error verifying authentication',
      });
    }
  };