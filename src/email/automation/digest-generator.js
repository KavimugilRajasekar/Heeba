const { queryOllama } = require('../../core/ollama-adapter');
const { getHeebaConfig } = require('../../core/config-loader');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { getEmailAccount } = require('../../core/email-accounts');

module.exports = {
    generate_digest: async (params, context) => {
        const config = context.config || getHeebaConfig();
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
                    const dateStr = params.date || new Date().toISOString().split('T')[0];
                    const since = new Date(dateStr);
                    const before = new Date(since); before.setDate(before.getDate() + 1);
                    
                    const fetchOptions = { since, before };
                    const messages = await client.fetch(fetchOptions, { source: true, envelope: true });
                    
                    for await (let msg of messages) {
                        const parsed = await simpleParser(msg.source);
                        emails.push({
                            from: msg.envelope.from[0]?.address || 'Unknown',
                            subject: msg.envelope.subject || '(No Subject)',
                            body: parsed.text || ''
                        });
                        if (emails.length >= 10) break; // Cap for summary
                    }
                } finally { lock.release(); }
            } catch (err) { 
                return { success: false, message: `IMAP Fetch Error: ${err.message}` }; 
            } finally { await client.logout(); }
        }

        if (emails.length === 0) return { success: true, message: 'No emails to summarize.' };

        const info = emails.map(e => `From: ${e.from}\nSubject: ${e.subject}`).join('\n\n');
        const prompt = `Create a short, punchy daily digest for the following emails:\n\n${info}`;
        
        try {
            const summary = await queryOllama(prompt, 'manual', config, null);
            return { success: true, message: `### Daily Digest\n\n${summary}` };
        } catch (e) {
            return { success: false, message: `Summarization Error: ${e.message}` };
        }
    }
};
