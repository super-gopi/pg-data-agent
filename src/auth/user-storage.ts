import fs from 'fs';
import path from 'path';

export interface User {
  username: string;
  password: string;
  userids: string[];
}

export interface UsersData {
  users: User[];
}

const USERS_FILE_PATH = path.join(process.cwd(), 'src/auth/users.json');

/**
 * Load users from users.json file
 * @returns UsersData object containing all users
 */
export function loadUsers(): UsersData {
  try {
    const fileContent = fs.readFileSync(USERS_FILE_PATH, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to load users: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Save users to users.json file
 * @param usersData - UsersData object to save
 */
export function saveUsers(usersData: UsersData): void {
  try {
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(usersData, null, 4));
  } catch (error) {
    throw new Error(`Failed to save users: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Find a user by username
 * @param username - Username to search for
 * @returns User object if found, null otherwise
 */
export function findUserByUsername(username: string): User | null {
  const usersData = loadUsers();
  const user = usersData.users.find(u => u.username === username);
  return user || null;
}

/**
 * Add user ID to a user's userids array
 * @param username - Username to update
 * @param userId - User ID to add
 * @returns true if successful, false otherwise
 */
export function addUserIdToUser(username: string, userId: string): boolean {
  try {
    const usersData = loadUsers();
    const user = usersData.users.find(u => u.username === username);

    if (!user) {
      return false;
    }

    // Add userId if not already present
    if (!user.userids.includes(userId)) {
      user.userids.push(userId);
      saveUsers(usersData);
    }

    return true;
  } catch (error) {
    console.error('Error adding user ID:', error);
    return false;
  }
}
