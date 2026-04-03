const { ImapFlow } = require('imapflow');

const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
        user: 'kavimugil28@gmail.com',
        pass: 'himp fnou ovuj kobk'
    },
    logger: false
});

async function testFetch() {
    console.log('Connecting to IMAP...');
    await client.connect();

    // Calculate the date 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    console.log('Fetching emails since:', threeDaysAgo.toDateString());

    let lock = await client.getMailboxLock('INBOX');
    try {
        // Search criteria
        let messages = await client.fetch({ since: threeDaysAgo }, { envelope: true });
        
        let count = 0;
        console.log('--- RECENT EMAILS ---');
        for await (let message of messages) {
            count++;
            const { envelope } = message;
            console.log(`[${count}] ${envelope.date.toISOString().split('T')[0]} | ${envelope.from[0].name || envelope.from[0].address} | ${envelope.subject}`);
        }
        
        if (count === 0) {
            console.log('No emails found in the last 3 days.');
        }
    } finally {
        lock.release();
    }

    await client.logout();
    console.log('Done.');
}

testFetch().catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
});
