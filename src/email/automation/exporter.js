const fs = require('fs');
const path = require('path');
const { EXPORT_DIR } = require('../../utils/paths');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { getEmailAccount } = require('../../core/email-accounts');

module.exports = {
    export_emails: async (params, context) => {
        const account = getEmailAccount(params.account_id);
        if (!account) return { success: false, message: 'Email credentials not configured.' };

        const dateStr = params.date || new Date().toISOString().split('T')[0];
        const client = new ImapFlow({
            host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
            auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
        });

        try {
            await client.connect();
            let lock = await client.getMailboxLock('INBOX');
            try {
                const since = new Date(dateStr);
                const before = new Date(since); before.setDate(before.getDate() + 1);
                const messages = await client.fetch({ since, before }, { source: true, envelope: true });
                
                let count = 0;
                let md = `# Email Export: ${dateStr}\n\n`;

                for await (let msg of messages) {
                    count++;
                    const parsed = await simpleParser(msg.source);
                    md += `## ${msg.envelope.subject || 'No Subject'}\n`;
                    md += `- **From**: ${msg.envelope.from[0].address}\n`;
                    md += `- **Date**: ${msg.envelope.date}\n\n`;
                    md += `${parsed.text || 'No text body.'}\n\n---\n\n`;
                }

                if (count === 0) return { success: true, message: `No emails to export for ${dateStr}.` };

                const file = path.join(EXPORT_DIR, `export_${dateStr.replace(/-/g, '')}.md`);
                fs.writeFileSync(file, md);
                return { success: true, message: `Exported ${count} emails to ${file}` };
            } finally { lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
