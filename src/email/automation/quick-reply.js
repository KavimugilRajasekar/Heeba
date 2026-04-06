const fs = require('fs');
const path = require('path');
const { getEmailAccount } = require('../../core/email-accounts');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

// pkg-compatible path for read-only bundled template
const AUTOMATION_BASE = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..', '..', '..');
const templatesPath = path.join(AUTOMATION_BASE, 'src', 'email', 'automation', 'templates.json');

const loadTemplates = () => {
    if (fs.existsSync(templatesPath)) {
        try { return JSON.parse(fs.readFileSync(templatesPath, 'utf8')); } catch (e) { return {}; }
    }
    return {};
};

module.exports = {
    quick_reply: async (params, context) => {
        const account = getEmailAccount(params.account_id);
        if (!account) return { success: false, message: 'Email credentials not configured.' };

        let { to, subject, reply_text, index } = params;
        
        // Resolve by index if provided
        if (!to || !subject) {
            const lastMailList = context.lastMailList || [];
            let uid = params.uid;
            const idx = parseInt(index);
            if (!uid && !isNaN(idx) && idx > 0 && idx <= lastMailList.length) {
                uid = lastMailList[idx - 1];
            }

            if (uid) {
                const client = new ImapFlow({
                    host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
                    auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
                });
                try {
                    await client.connect();
                    let lock = await client.getMailboxLock('INBOX');
                    try {
                        const message = await client.fetchOne(uid, { source: true });
                        if (message) {
                            const parsed = await simpleParser(message.source);
                            to = parsed.from?.value[0]?.address || parsed.from?.text;
                            subject = parsed.subject || '';
                        }
                    } finally { lock.release(); }
                } catch (e) { /* ignore and use params if available */ }
                finally { await client.logout(); }
            }
        }

        if (!to) return { success: false, message: 'Missing recipient. Please provide "to" or a valid email index.' };

        let body = reply_text || params.custom_text || '';
        if (params.template_key) {
            const templates = loadTemplates();
            if (templates[params.template_key]) body = templates[params.template_key];
        }

        if (!body) return { success: false, message: 'Reply body is empty.' };

        const transporter = nodemailer.createTransport({
            host: account.smtp_host || account.smtp || 'smtp.gmail.com', port: account.smtp_port || 465,
            secure: (account.smtp_port || 465) === 465,
            auth: { user: account.email, pass: account.app_password || account.pass }
        });

        try {
            const mailOptions = {
                from: account.email, 
                to, 
                subject: subject ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`) : 'Re: (No Subject)', 
                text: body
            };
            const info = await transporter.sendMail(mailOptions);
            return { success: true, message: `Quick reply sent to ${to}. (ID: ${info.messageId})` };
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
    }
};
