// src/core/email-accounts.js
// Multi-email account management with backward compatibility
const fs = require('fs');
const path = require('path');
const { HEEBA_JSON_PATH, CREDENTIALS_PATH } = require('../utils/paths');
const { getHeebaConfig, reloadConfig } = require('./config-loader');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');

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

// Legacy credentials.json support
function getLegacyEmailCredentials() {
    try {
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

// Add or update email account
function addEmailAccount(account) {
    if (!account.id) {
        account.id = `account_${Date.now()}`;
    }

    const config = getHeebaConfig();
    if (!config.email_accounts) {
        config.email_accounts = [];
    }

    const existingIdx = config.email_accounts.findIndex(a => a.id === account.id);
    if (existingIdx >= 0) {
        config.email_accounts[existingIdx] = account;
    } else {
        config.email_accounts.push(account);
    }

    // If first account, set as default
    if (config.email_accounts.length === 1) {
        config.default_email_account = account.id;
    }

    fs.writeFileSync(HEEBA_JSON_PATH, JSON.stringify(config, null, 2), 'utf8');
    reloadConfig();
    return account;
}

// Delete email account
function deleteEmailAccount(accountId) {
    const config = getHeebaConfig();
    if (!config.email_accounts) return false;

    const idx = config.email_accounts.findIndex(a => a.id === accountId);
    if (idx >= 0) {
        config.email_accounts.splice(idx, 1);

        // Clear default if deleted
        if (config.default_email_account === accountId) {
            config.default_email_account = config.email_accounts[0]?.id || null;
        }

        fs.writeFileSync(HEEBA_JSON_PATH, JSON.stringify(config, null, 2), 'utf8');
        reloadConfig();
        return true;
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
