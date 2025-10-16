import { findUserByUsername, addUserIdToUser } from './user-storage';
import { hashPassword } from './utils';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface ValidationResult {
  success: boolean;
  message: string;
  username?: string;
}

/**
 * Validate user credentials
 * @param credentials - Login credentials with username and password
 * @returns ValidationResult indicating success or failure
 */
export function validateUser(credentials: LoginCredentials): ValidationResult {
  const { username, password } = credentials;

  // Check if username and password are provided
  if (!username || !password) {
    return {
      success: false,
      message: 'Username and password are required'
    };
  }

  // Find user by username
  const user = findUserByUsername(username);

  if (!user) {
    return {
      success: false,
      message: 'Invalid username '
    };
  }

  // Hash the user  password and compare with  password
  const hashedPassword = hashPassword(user.password);

  if (hashedPassword !== password) {
    return {
      success: false,
      message: 'Invalid  password'
    };
  }

  return {
    success: true,
    message: 'Authentication successful',
    username: user.username
  };
}

/**
 * Authenticate user and store userId
 * @param credentials - Login credentials
 * @param userId - User ID to store
 * @returns ValidationResult with authentication status
 */
export function authenticateAndStoreUserId(credentials: LoginCredentials, userId: string): ValidationResult {
  const validationResult = validateUser(credentials);

  if (!validationResult.success) {
    return validationResult;
  }

  // Store userId in user's userids array
  const stored = addUserIdToUser(credentials.username, userId);

  if (!stored) {
    return {
      success: false,
      message: 'Failed to store user session'
    };
  }

  return validationResult;
}
