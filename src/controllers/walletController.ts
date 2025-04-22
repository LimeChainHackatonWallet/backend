import { Request, Response } from 'express';
import * as solana from '../utils/solana';
import * as webAuthn from '../utils/webAuthn';
import { users } from '../utils/storage';

/**
 * Get wallet info and balance
 */
export const getWalletInfo = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }
    
    const user = users.get(username);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    console.log(`Found user: ${user.username} with ID: ${user.id}`);
    // Get credential ID for this user
    const credentialId = webAuthn.getCredentialIdForUser(user.id);
    console.log(`Retrieved credential ID of length: ${credentialId.length}`);

    // Derive private key from credential ID
    const privateKey = solana.derivePrivateKey(credentialId);
    console.log(`Derived private key of length: ${privateKey.length}`);

    
    // Create keypair
    const keypair = solana.createKeypairFromPrivateKey(privateKey);
    console.log(`Created keypair with public key: ${keypair.publicKey.toString()}`);
    
    // Get account info
    const accountInfo = await solana.getAccountInfo(keypair.publicKey);
    console.log(`Retrieved account info: ${JSON.stringify(accountInfo)}`);
    
    return res.status(200).json({
      success: true,
      data: accountInfo,
    });
  } catch (error) {
    console.error('Get wallet info error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting wallet information',
    });
  }
};

/**
 * Transfer SOL to another address
 */
export const transfer = async (req: Request, res: Response) => {
  try {
    const { username, recipient, amount } = req.body;
    
    if (!username || !recipient || !amount) {
      return res.status(400).json({ success: false, message: 'Username, recipient, and amount are required' });
    }
    
    const user = users.get(username);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Get credential ID for this user
    const credentialId = webAuthn.getCredentialIdForUser(user.id);
    
    // Derive private key from credential ID
    const privateKey = solana.derivePrivateKey(credentialId);
    
    // Create keypair
    const keypair = solana.createKeypairFromPrivateKey(privateKey);
    
    // Transfer SOL
    const result = await solana.transferSol(keypair, recipient, amount);
    
    return res.status(200).json({
      success: true,
      message: 'Transfer successful',
      data: result,
    });
  } catch (error) {
    console.error('Transfer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error transferring funds',
    });
  }
};

/**
 * Sign a message
 */
export const signMessage = async (req: Request, res: Response) => {
  try {
    const { username, message } = req.body;
    
    if (!username || !message) {
      return res.status(400).json({ success: false, message: 'Username and message are required' });
    }
    
    const user = users.get(username);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Get credential ID for this user
    const credentialId = webAuthn.getCredentialIdForUser(user.id);
    
    // Derive private key from credential ID
    const privateKey = solana.derivePrivateKey(credentialId);
    
    // Create keypair
    const keypair = solana.createKeypairFromPrivateKey(privateKey);
    
    // Sign message
    const signature = solana.signMessage(keypair, message);
    
    return res.status(200).json({
      success: true,
      message: 'Message signed successfully',
      data: {
        publicKey: keypair.publicKey.toString(),
        signature,
        message,
      },
    });
  } catch (error) {
    console.error('Signing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error signing message',
    });
  }
};

/**
 * Request airdrop (for testing on devnet)
 */
export const requestAirdrop = async (req: Request, res: Response) => {
  try {
    const { username, amount } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }
    
    const user = users.get(username);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Get credential ID for this user
    const credentialId = webAuthn.getCredentialIdForUser(user.id);
    
    // Derive private key from credential ID
    const privateKey = solana.derivePrivateKey(credentialId);
    
    // Create keypair
    const keypair = solana.createKeypairFromPrivateKey(privateKey);
    
    // Request airdrop
    const result = await solana.requestAirdrop(keypair.publicKey, amount || 1);
    
    return res.status(200).json({
      success: true,
      message: 'Airdrop successful',
      data: result,
    });
  } catch (error) {
    console.error('Airdrop error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error requesting airdrop',
    });
  }
};