const { simpleParser } = require('mailparser');
const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');
const { formatEmailTable } = require('../../utils/table-formatter');

module.exports = {
    detect_otp: async (params, context = {}) => {
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
                since.setHours(since.getHours() - 1); 
                const messages = await client.fetch({ since }, { source: true, envelope: true });
                
                const otps = [];
                const regex = /\b\d{4,8}\b|\b[A-Z0-9]{6,8}\b/;

                for await (let msg of messages) {
                    if (msg.envelope.subject.match(/otp|verification|code|password/i)) {
                        const parsed = await simpleParser(msg.source);
                        const body = parsed.text || '';
                        const match = body.match(regex) || msg.envelope.subject.match(regex);
                        if (match) {
                            otps.push({ 
                                date: msg.envelope.date,
                                from: msg.envelope.from[0]?.address || 'Unknown', 
                                subject: msg.envelope.subject,
                                otp_code: match[0] 
                            });
                        }
                    }
                }

                if (otps.length === 0) return { success: true, message: 'No OTPs found in the last hour.' };
                
                // Show as tabular
                let out = formatEmailTable(otps, `[Recent OTPs]`, context, [
                    { key: 'otp_code', name: 'OTP Code', width: 10 }
                ]);
                return { success: true, message: out };
            } finally { lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
