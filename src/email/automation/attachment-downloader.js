const fs = require('fs');
const path = require('path');
const { getEmailAccount } = require('../../core/email-accounts');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { DOWNLOADS_DIR } = require('../../utils/paths');

module.exports = {
    download_attachments: async (params, context) => {
        const account = getEmailAccount(params.account_id);
        if (!account) return { success: false, message: 'Email credentials not configured.' };

        const uid = params.uid;
        if (!uid) return { success: false, message: 'Missing email UID.' };

        const client = new ImapFlow({
            host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
            auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
        });

        try {
            await client.connect();
            let lock = await client.getMailboxLock('INBOX');
            try {
                const message = await client.fetchOne(uid, { source: true });
                if (!message) return { success: false, message: 'Email not found.' };

                const parsed = await simpleParser(message.source);
                if (!parsed.attachments || parsed.attachments.length === 0) {
                    return { success: true, message: 'No attachments found.' };
                }

                const dateStr = new Date().toISOString().split('T')[0];
                const destDir = path.join(DOWNLOADS_DIR, dateStr);
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

                let saved = [];
                for (let att of parsed.attachments) {
                    const fp = path.join(destDir, att.filename || `attachment_${Date.now()}`);
                    fs.writeFileSync(fp, att.content);
                    saved.push(att.filename);
                }

                return { success: true, message: `Downloaded ${saved.length} attachments to ${destDir}\nFiles: ${saved.join(', ')}` };
            } finally { lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
