const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');
const { formatEmailTable } = require('../../utils/table-formatter');

module.exports = {
    track_followups: async (params, context) => {
        const account = getEmailAccount(params.account_id);
        if (!account) return { success: false, message: 'Email credentials not configured.' };

        const days = params.days || 3;
        const since = new Date();
        since.setDate(since.getDate() - (days + 7)); 
        const before = new Date();
        before.setDate(before.getDate() - days);

        const client = new ImapFlow({
            host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
            auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
        });

        try {
            await client.connect();
            let sentBox = '[Gmail]/Sent Mail';
            let lock = await client.getMailboxLock(sentBox).catch(() => null);
            if (!lock) {
                sentBox = 'Sent';
                lock = await client.getMailboxLock(sentBox).catch(() => null);
            }
            if (!lock) return { success: false, message: 'Could not access Sent folder.' };

            try {
                const messages = await client.fetch({ since, before }, { envelope: true });
                let msgList = [];
                for await (let msg of messages) {
                    const to = msg.envelope.to?.[0]?.address || 'Unknown';
                    const diffTime = Math.abs(new Date() - new Date(msg.envelope.date));
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                    
                    msgList.push({
                        date: msg.envelope.date,
                        from: to, // showing "to" in "from" column is fine since it's sent box
                        subject: msg.envelope.subject,
                        days_ago: `${diffDays}d`
                    });
                }
                if (msgList.length === 0) return { success: true, message: `No follow-ups needed for mails sent between ${days} and ${days+7} days ago.` };

                let out = formatEmailTable(msgList, `[Pending Follow-ups] (Sent Box)`, context, [
                    { key: 'days_ago', name: 'Age', width: 5 }
                ]);
                return { success: true, message: out };
            } finally { lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
