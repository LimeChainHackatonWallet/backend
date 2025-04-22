// Shared storage for user data
export const users = new Map<string, any>();

// Simple in-memory token storage
export const tokens = new Set<string>();

// Add token to valid tokens
export const storeToken = (token: string) => {
  tokens.add(token);
};

// Check if token is valid
export const isValidToken = (token: string): boolean => {
  return tokens.has(token);
};