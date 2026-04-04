const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');

module.exports = {
    generate_stats: async (params, context) => {
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
                const since = new Date();
                since.setDate(since.getDate() - 7); // Last 7 days

                const messages = await client.fetch({ since }, { envelope: true });
                let count = 0;
                let senders = {};

                for await (let msg of messages) {
                    count++;
                    const addr = msg.envelope.from[0].address;
                    if (!senders[addr]) senders[addr] = 0;
                    senders[addr]++;
                }

                let topSenders = Object.entries(senders).sort((a,b) => b[1] - a[1]).slice(0, 5);
                
                let out = `[Weekly Email Stats]\n\nTotal Received: ${count}\n\nTop Senders:\n`;
                topSenders.forEach(s => out += ` - ${s[0]}: ${s[1]} emails\n`);

                return { success: true, message: out };
            } finally { lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
