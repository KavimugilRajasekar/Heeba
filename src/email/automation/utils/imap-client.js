// src/email/automation/utils/imap-client.js
const { ImapFlow } = require('imapflow');

/**
 * Creates an IMAP client for the given account
 */
function createImapClient(account) {
  return new ImapFlow({
    host: account.imap_host || account.host || 'imap.gmail.com',
    port: account.port || 993,
    secure: true,
    auth: { user: account.email, pass: account.app_password || account.pass },
    logger: false
  });
}

/**
 * Executes a function with an IMAP mailbox lock, handling connect/logout automatically
 * @param {Object} account - Email account object
 * @param {string} mailbox - Mailbox name (e.g., 'INBOX', '[Gmail]/Sent Mail')
 * @param {Function} fn - Async function to execute with (client, lock)
 */
async function withMailboxLock(account, mailbox, fn) {
  const client = createImapClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      return await fn(client, lock);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

/**
 * Creates SMTP transporter for an account
 */
function createSmtpTransport(account) {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: account.smtp_host || account.smtp || 'smtp.gmail.com',
    port: account.smtp_port || 465,
    secure: (account.smtp_port || 465) === 465,
    auth: { user: account.email, pass: account.app_password || account.pass }
  });
}

module.exports = {
  createImapClient,
  withMailboxLock,
  createSmtpTransport
};
