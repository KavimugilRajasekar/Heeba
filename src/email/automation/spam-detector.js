const { simpleParser } = require('mailparser');
const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');
const { formatEmailTable } = require('../../utils/table-formatter');

module.exports = {
    detect_spam: async (params, context) => {
        const account = getEmailAccount(params.account_id);
        if (!account) return { success: false, message: 'Email credentials not configured.' };

        const client = new ImapFlow({
            host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
            auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
        });

        const spamKeywords = ['winner', 'subscribe', 'unsubscribe', 'free', 'discount', 'offer', 'viagra', 'crypto', 'giveaway'];

        try {
            await client.connect();
            let lock = await client.getMailboxLock('INBOX');
            try {
                const since = new Date();
                since.setDate(since.getDate() - 2); 
                const messages = await client.fetch({ since }, { source: true, envelope: true });
                
                let spamMails = [];

                for await (let msg of messages) {
                    const parsed = await simpleParser(msg.source);
                    let score = 0;
                    
                    const text = (parsed.text || msg.envelope.subject || '').toLowerCase();
                    spamKeywords.forEach(k => {
                        if (text.includes(k)) score++;
                    });
                    
                    if (score >= 2) {
                        spamMails.push({
                            date: msg.envelope.date,
                            from: msg.envelope.from[0]?.address,
                            subject: msg.envelope.subject,
                            spam_score: String(score)
                        });
                    }
                }

                if (spamMails.length === 0) return { success: true, message: 'No obvious spam found.' };

                let out = formatEmailTable(spamMails, `[Spam/Promo Detector]`, context, [
                    { key: 'spam_score', name: 'Score', width: 6 }
                ]);
                return { success: true, message: out };
            } finally { lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
