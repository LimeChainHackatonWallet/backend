import { 
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
  } from '@simplewebauthn/server';
  import type {
    RegistrationResponseJSON,
    AuthenticationResponseJSON
  } from '@simplewebauthn/typescript-types';
  import config from '../config';
  
  // In-memory storage for authenticator info (in production, use a database)
  const authenticators = new Map<string, any>();
  
  /**
   * Generate registration options for WebAuthn
   * @param userId Unique user identifier
   * @param username User's username
   */
  export const generateRegOptions = async (userId: string, username: string) => {
    const options = await generateRegistrationOptions({
      rpName: config.webAuthn.rpName,
      rpID: config.webAuthn.rpId,
      userID: userId,
      userName: username,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    });
    
    // Store challenge for verification
    authenticators.set(`${userId}_challenge`, options.challenge);
    
    return options;
  };
  
  /**
   * Verify registration response from client
   * @param userId User identifier
   * @param response Registration response from client
   */
  export const verifyRegResponse = async (userId: string, response: RegistrationResponseJSON) => {
    const expectedChallenge = authenticators.get(`${userId}_challenge`);
    
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.webAuthn.origin,
      expectedRPID: config.webAuthn.rpId,
    });
    
    if (verification.verified) {
      const { credentialID, credentialPublicKey } = verification.registrationInfo!;
      
      // Store authenticator info
      authenticators.set(userId, {
        credentialID: Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64url'),
        counter: verification.registrationInfo!.counter,
      });
      
      // Remove challenge
      authenticators.delete(`${userId}_challenge`);
    }
    
    return verification;
  };
  
  /**
   * Generate authentication options for WebAuthn
   * @param userId User identifier
   */
  export const generateAuthOptions = async (userId: string) => {
    const authenticator = authenticators.get(userId);
    
    if (!authenticator) {
      throw new Error('Authenticator not found');
    }
    
    const options = await generateAuthenticationOptions({
      rpID: config.webAuthn.rpId,
      userVerification: 'required',
      allowCredentials: [{
        id: Buffer.from(authenticator.credentialID, 'base64url'),
        type: 'public-key',
      }]
    });
    
    // Store challenge for verification
    authenticators.set(`${userId}_challenge`, options.challenge);
    
    return options;
  };
  
  /**
   * Verify authentication response from client
   * @param userId User identifier
   * @param response Authentication response from client
   */
  export const verifyAuthResponse = async (userId: string, response: AuthenticationResponseJSON) => {
    const expectedChallenge = authenticators.get(`${userId}_challenge`);
    const authenticator = authenticators.get(userId);
    
    if (!authenticator) {
      throw new Error('Authenticator not found');
    }
    
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.webAuthn.origin,
      expectedRPID: config.webAuthn.rpId,
      authenticator: {
        credentialID: Buffer.from(authenticator.credentialID, 'base64url'),
        credentialPublicKey: Buffer.from(authenticator.credentialPublicKey, 'base64url'),
        counter: authenticator.counter,
      },
    });
    
    if (verification.verified) {
      // Update counter
      authenticator.counter = verification.authenticationInfo.newCounter;
      authenticators.set(userId, authenticator);
      
      // Remove challenge
      authenticators.delete(`${userId}_challenge`);
    }
    
    return verification;
  };
  
  /**
   * Get raw credential ID for private key derivation
   * @param userId User identifier
   */
  export const getCredentialIdForUser = (userId: string) => {
    const authenticator = authenticators.get(userId);
    if (!authenticator) {
        throw new Error(`Authenticator not found for user ID: ${userId}`);
    }
    return Buffer.from(authenticator.credentialID, 'base64url');
  };