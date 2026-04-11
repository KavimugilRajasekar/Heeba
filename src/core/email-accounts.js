// src/core/email-accounts.js
// Multi-email account management with backward compatibility
const fs = require('fs');
const path = require('path');
const { HEEBA_JSON_PATH, CREDENTIALS_PATH } = require('../utils/paths');
const { getHeebaConfig, reloadConfig } = require('./config-loader');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { decryptJson } = require('../utils/crypto');

// Confidential encrypted credentials path
const ENC_CREDENTIALS_PATH = CREDENTIALS_PATH.replace('.json', '.ex.json');

// Get email account by ID, falls back to default or first account
function getEmailAccount(accountId) {
    const config = getHeebaConfig();

    // Try heeba.json email_accounts first
    if (config.email_accounts && config.email_accounts.length > 0) {
        if (accountId) {
            const found = config.email_accounts.find(a => a.id === accountId);
            if (found) return found;
        }
        // Return default or first
        if (config.default_email_account) {
            const def = config.email_accounts.find(a => a.id === config.default_email_account);
            if (def) return def;
        }
        return config.email_accounts[0];
    }

    // Fall back to legacy credentials.json
    return getLegacyEmailCredentials();
}

// Legacy credentials.json support (decrypts encrypted credentials.ex.json)
function getLegacyEmailCredentials() {
    try {
        // Try encrypted credentials first
        if (fs.existsSync(ENC_CREDENTIALS_PATH)) {
            const encrypted = fs.readFileSync(ENC_CREDENTIALS_PATH, 'utf8');
            const creds = decryptJson(encrypted);
            if (Array.isArray(creds.email) && creds.email.length > 0) {
                return {
                    id: 'legacy',
                    email: creds.email[0].user,
                    app_password: creds.email[0].pass,
                    imap_host: creds.email[0].host || 'imap.gmail.com',
                    smtp_host: creds.email[0].smtp || 'smtp.gmail.com'
                };
            } else if (creds.email && typeof creds.email === 'object') {
                return {
                    id: 'legacy',
                    email: creds.email.user,
                    app_password: creds.email.pass,
                    imap_host: creds.email.host || 'imap.gmail.com',
                    smtp_host: creds.email.smtp || 'smtp.gmail.com'
                };
            }
        }
        // Fall back to plain credentials (not recommended)
        if (fs.existsSync(CREDENTIALS_PATH)) {
            const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            if (Array.isArray(creds.email) && creds.email.length > 0) {
                return {
                    id: 'legacy',
                    email: creds.email[0].user,
                    app_password: creds.email[0].pass,
                    imap_host: creds.email[0].host || 'imap.gmail.com',
                    smtp_host: creds.email[0].smtp || 'smtp.gmail.com'
                };
            } else if (creds.email && typeof creds.email === 'object') {
                return {
                    id: 'legacy',
                    email: creds.email.user,
                    app_password: creds.email.pass,
                    imap_host: creds.email.host || 'imap.gmail.com',
                    smtp_host: creds.email.smtp || 'smtp.gmail.com'
                };
            }
        }
    } catch (e) { /* silent */ }
    return null;
}

// Get all email accounts
function getAllEmailAccounts() {
    const config = getHeebaConfig();
    if (config.email_accounts && config.email_accounts.length > 0) {
        return config.email_accounts;
    }
    const legacy = getLegacyEmailCredentials();
    return legacy ? [legacy] : [];
}

// Add or update email account (Persists to credentials.json)
function addEmailAccount(account) {
    if (!account.id) {
        account.id = account.email || `account_${Date.now()}`;
    }

    try {
        let creds = { email: [] };
        if (fs.existsSync(CREDENTIALS_PATH)) {
            creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        }
        if (!Array.isArray(creds.email)) creds.email = [];

        // Check for existing by email or ID
        const existingIdx = creds.email.findIndex(a => a.user === account.email || a.id === account.id);
        
        const entry = {
            id: account.id,
            user: account.email || account.user,
            pass: account.app_password || account.pass,
            host: account.imap_host || account.host || 'imap.gmail.com',
            port: account.port || 993,
            smtp: account.smtp_host || account.smtp || 'smtp.gmail.com',
            smtp_port: account.smtp_port || account.port_smtp || 465,
            primary: account.primary || (creds.email.length === 0)
        };

        if (entry.primary) {
            creds.email.forEach(a => a.primary = false);
        }

        if (existingIdx >= 0) {
            creds.email[existingIdx] = entry;
        } else {
            creds.email.push(entry);
        }

        fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf8');
        return entry;
    } catch (e) {
        console.error('Error adding email account to credentials:', e);
        return null;
    }
}

// Delete email account from credentials.json
function deleteEmailAccount(accountId) {
    try {
        if (!fs.existsSync(CREDENTIALS_PATH)) return false;
        const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        if (!Array.isArray(creds.email)) return false;

        const idx = creds.email.findIndex(a => a.id === accountId || a.user === accountId);
        if (idx >= 0) {
            const wasPrimary = creds.email[idx].primary;
            creds.email.splice(idx, 1);
            if (wasPrimary && creds.email.length > 0) {
                creds.email[0].primary = true;
            }
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf8');
            return true;
        }
    } catch (e) {
        console.error('Error deleting email account:', e);
    }
    return false;
}

// Set an account as primary
function setPrimaryAccount(accountId) {
    try {
        if (!fs.existsSync(CREDENTIALS_PATH)) return false;
        const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        if (!Array.isArray(creds.email)) return false;

        const found = creds.email.find(a => a.id === accountId || a.user === accountId);
        if (found) {
            creds.email.forEach(a => a.primary = false);
            found.primary = true;
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf8');
            return true;
        }
    } catch (e) {
        console.error('Error setting primary account:', e);
    }
    return false;
}

// Test IMAP connection
async function testEmailAccount(account) {
    const client = new ImapFlow({
        host: account.imap_host || 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: account.email, pass: account.app_password },
        logger: false
    });

    try {
        await client.connect();
        await client.getMailboxLock('INBOX');
        client.logout();
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

module.exports = {
    getEmailAccount,
    getAllEmailAccounts,
    addEmailAccount,
    deleteEmailAccount,
    testEmailAccount
};
