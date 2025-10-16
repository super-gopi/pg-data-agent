import crypto from 'crypto';

/**
 * Decode base64 encoded string and parse JSON
 * @param base64Data - Base64 encoded string
 * @returns Parsed JSON object
 */
export function decodeBase64ToJson(base64Data: string): any {
  try {
    const decodedString = Buffer.from(base64Data, 'base64').toString('utf-8');
    return JSON.parse(decodedString);
  } catch (error) {
    throw new Error(`Failed to decode base64 data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Hash password using SHA1
 * @param password - Plain text password
 * @returns SHA1 hashed password
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha1').update(password).digest('hex');
}
