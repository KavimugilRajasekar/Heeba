// src/utils/crypto.js
// Encryption utilities for sensitive data using AES-256-GCM
const crypto = require('crypto');

// Hardcoded encryption key (32 bytes for AES-256)
const ENCRYPTION_KEY = Buffer.from('f5799f951e522c7413d6a3024829c77c34b9f965edd521aaac1ea5d6c6564913', 'hex');
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @returns {string} - Base64 encoded encrypted data (IV + AuthTag + Ciphertext)
 */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: IV:AuthTag:Ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @returns {string} - Decrypted plaintext
 */
function decrypt(encryptedData) {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt a JSON object and return encrypted string
 * @param {object} data - Object to encrypt
 * @returns {string} - Encrypted string
 */
function encryptJson(data) {
  return encrypt(JSON.stringify(data, null, 2));
}

/**
 * Decrypt to a JSON object
 * @param {string} encryptedData - Encrypted string
 * @returns {object} - Decrypted object
 */
function decryptJson(encryptedData) {
  return JSON.parse(decrypt(encryptedData));
}

module.exports = {
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
  ENCRYPTION_KEY
};
