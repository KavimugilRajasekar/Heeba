const { ImapFlow } = require('imapflow');
const { getEmailAccount } = require('../../core/email-accounts');

async function performBulkAction(params, account_id, targetAction) {
    const account = getEmailAccount(account_id || params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const { from_sender, category } = params;
    let searchCriteria = {};
    
    if (from_sender) searchCriteria.from = from_sender;
    else if (category) {
        if (category.toLowerCase() === 'promotional' || category.toLowerCase() === 'promo') {
            searchCriteria.header = { 'X-Google-Smtp-Source': 'promo' }; // Simplified
        }
    }

    const client = new ImapFlow({
        host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
        auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
    });

    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        try {
            let uids = [];
            const messages = await client.fetch(searchCriteria, { uid: true });
            for await (let msg of messages) {
                uids.push(msg.uid);
            }

            if (uids.length === 0) return { success: true, message: `No matching emails found.` };

            if (targetAction === 'mark_read') {
                await client.messageFlagsAdd(uids, ['\\Seen']);
                return { success: true, message: `Marked ${uids.length} emails as read.` };
            } else if (targetAction === 'archive' || targetAction === 'delete') {
                await client.messageFlagsAdd(uids, ['\\Deleted']);
                return { success: true, message: `Archived/Deleted ${uids.length} emails.` };
            }
            return { success: false, message: 'Unknown internal action.' };
        } finally { if (lock) lock.release(); }
    } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
    finally { await client.logout(); }
}

module.exports = {
    bulk_mark_read: async (params, context) => {
        return await performBulkAction(params, params.account_id, 'mark_read');
    },
    bulk_archive: async (params, context) => {
        return await performBulkAction(params, params.account_id, 'archive');
    }
};
