const { queryOllama } = require('../../core/ollama-adapter');
const { getHeebaConfig } = require('../../core/config-loader');
const { simpleParser } = require('mailparser');
const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');

module.exports = {
    email_to_task: async (params, context) => {
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
                const body = parsed.text || '';
                
                const prompt = `Extract any actionable tasks and deadlines from this email body. Output a clear checklist. Limit to 3 items.\n\nBody: ${body.substring(0, 1000)}`;
                const config = getHeebaConfig();
                
                const tasks = await queryOllama(prompt, 'manual', config, null);
                return { success: true, message: `[Extracted Tasks]\n\n${tasks}` };
            } finally { lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
