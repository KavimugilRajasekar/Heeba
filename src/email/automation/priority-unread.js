const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');
const { formatEmailTable } = require('../../utils/table-formatter');

module.exports = {
    fetch_priority_unread: async (params, context) => {
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
                // Fetch unread messages
                const messages = await client.fetch({ unseen: true }, { envelope: true });
                let formatted = [];

                for await (let msg of messages) {
                    const fromStr = msg.envelope.from[0]?.address?.toLowerCase() || '';
                    const subStr = (msg.envelope.subject || '').toLowerCase();
                    const isPriority = fromStr.includes('boss') || fromStr.includes('manager') || subStr.includes('urgent');
                    
                    formatted.push({
                        date: msg.envelope.date,
                        from: msg.envelope.from[0]?.address,
                        subject: msg.envelope.subject,
                        priority_level: isPriority ? '🔴 HIGH' : '⚪ NORMAL'
                    });
                }

                if (formatted.length === 0) return { success: true, message: 'No unread emails.' };

                // Sort HIGH priority to top
                formatted.sort((a,b) => b.priority_level.localeCompare(a.priority_level));

                let out = formatEmailTable(formatted, `[Unread Emails Priority View]`, context, [
                    { key: 'priority_level', name: 'Priority', width: 9 }
                ]);

                return { success: true, message: out };
            } finally { lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
