const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');

module.exports = {
    render_timeline: async (params, context) => {
        let emails = params.emails || [];

        // Self-fetch if no emails provided (CLI mode)
        if (emails.length === 0) {
            const account = getEmailAccount(params.account_id);
            if (!account) return { success: false, message: 'Email credentials not configured.' };

            const client = new ImapFlow({
                host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
                auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
            });

            try {
                await client.connect();
                let lock = await client.getMailboxLock('INBOX');
                try {
                    const days = params.days || 3;
                    const since = new Date(); since.setDate(since.getDate() - days);
                    const messages = await client.fetch({ since }, { envelope: true });
                    
                    for await (let msg of messages) {
                        emails.push({
                            date: msg.envelope.date,
                            from: msg.envelope.from[0]?.address || msg.envelope.from[0]?.name || 'Unknown',
                            subject: msg.envelope.subject || '(No Subject)'
                        });
                    }
                } finally { lock.release(); }
            } catch (err) { 
                return { success: false, message: `IMAP Fetch Error: ${err.message}` }; 
            } finally { await client.logout(); }
        }

        if (emails.length === 0) return { success: true, message: 'No emails for timeline.' };

        // Ensure chronological order
        const sorted = [...emails].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        let output = `[Timeline View]\n\n`;
        let lastDate = '';

        sorted.forEach(msg => {
            const d = new Date(msg.date);
            const dateStr = d.toISOString().split('T')[0];
            const timeStr = d.toTimeString().split(' ')[0].substring(0, 5);

            if (dateStr !== lastDate) {
                output += `\n 📅 ${dateStr}\n`;
                lastDate = dateStr;
            }

            output += `   │\n   ├─ [${timeStr}] ${msg.from}\n   │  "${msg.subject}"\n`;
        });

        return { success: true, message: output };
    }
};
