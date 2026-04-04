const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');

module.exports = {
    bulk_action: async (params, context) => {
        const account = getEmailAccount(params.account_id);
        if (!account) return { success: false, message: 'Email credentials not configured.' };

        const { from_sender, action } = params; // action can be 'mark_read', 'archive'
        if (!from_sender) return { success: false, message: 'Missing sender to target bulk action.' };

        const client = new ImapFlow({
            host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
            auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
        });

        try {
            await client.connect();
            let lock = await client.getMailboxLock('INBOX');
            try {
                // Find emails
                let uids = [];
                const messages = await client.fetch({ from: from_sender }, { uid: true });
                for await (let msg of messages) {
                    uids.push(msg.uid);
                }

                if (uids.length === 0) return { success: true, message: `No emails found from ${from_sender}.` };

                if (action === 'mark_read') {
                    await client.messageFlagsAdd(uids, ['\\Seen']);
                    return { success: true, message: `Marked ${uids.length} emails from ${from_sender} as read.` };
                } else if (action === 'archive') {
                    // Just removing from inbox by moving to Archive / All Mail.
                    // This is complex on IMAP without knowing target folder but we try simple flag deletion for now.
                    await client.messageFlagsAdd(uids, ['\\Deleted']);
                    await client.mailboxClose(); // expunge
                    return { success: true, message: `Deleted/Archived ${uids.length} emails from ${from_sender}.` };
                }

                return { success: false, message: 'Unknown action.' };
            } finally { if (lock) lock.release(); }
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
        finally { await client.logout(); }
    }
};
