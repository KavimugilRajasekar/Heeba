const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');

module.exports = {
    categorize_emails: async (params, context) => {
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
                            from: msg.envelope.from[0]?.address || 'Unknown',
                            subject: msg.envelope.subject || '(No Subject)'
                        });
                    }
                } finally { lock.release(); }
            } catch (err) { 
                return { success: false, message: `IMAP Fetch Error: ${err.message}` }; 
            } finally { await client.logout(); }
        }

        if (emails.length === 0) return { success: true, message: 'No emails to categorize.' };

        const categories = {
            important: [], work: [], shopping: [], alerts: [], promo: [], other: []
        };
        
        emails.forEach(email => {
            const subject = email.subject.toLowerCase();
            const from = email.from.toLowerCase();
            if (from.includes('boss') || subject.includes('urgent')) categories.important.push(email);
            else if (from.includes('jira') || from.includes('github') || from.includes('slack')) categories.work.push(email);
            else if (from.includes('amazon') || subject.includes('order')) categories.shopping.push(email);
            else if (subject.includes('alert') || subject.includes('warning')) categories.alerts.push(email);
            else if (subject.includes('promo') || subject.includes('discount')) categories.promo.push(email);
            else categories.other.push(email);
        });

        let summary = `[Email Categorization Summary]\n\n`;
        Object.entries(categories).forEach(([name, list]) => {
            if (list.length > 0) {
                summary += ` ◈ ${name.toUpperCase()}: ${list.length} emails\n`;
            }
        });
        
        return { success: true, message: summary, categories };
    }
};
