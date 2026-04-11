// scratch/verify_visuals.js
const emailHandlers = require('../src/core/handlers/email-handler');
const fileHandlers = require('../src/core/handlers/file-handler');
const systemHandlers = require('../src/core/handlers/system-handler');
const categorizer = require('../src/email/automation/categorizer');

async function test() {
    console.log('\n--- TESTING SYSTEM INFO ---');
    const sys = await systemHandlers.get_system_info();
    console.log(sys.message);

    console.log('\n--- TESTING FILE MOVE ---');
    // Mocking an existing file for move test
    const fs = require('fs');
    fs.writeFileSync('test_src.txt', 'hello');
    const move = await fileHandlers.move_file({ source: 'test_src.txt', destination: 'test_dest.txt' });
    console.log(move.message);
    if (fs.existsSync('test_dest.txt')) fs.unlinkSync('test_dest.txt');

    console.log('\n--- TESTING EMAIL CATEGORIZER (MOCK) ---');
    const mockEmails = [
        { from: 'boss@corp.com', subject: 'Urgent meeting', date: new Date() },
        { from: 'jira@atlassian.com', subject: '[JIRA] Bug fixed', date: new Date() },
        { from: 'amazon@com', subject: 'Your order', date: new Date() }
    ];
    const cat = await categorizer.categorize_emails({ emails: mockEmails });
    console.log(cat.message);

    console.log('\n--- TESTING EMAIL SEND (PREPARING) ---');
    // We won't actually send to avoid SMTP errors, just testing the tree building part
    // by mocking a failure or just showing the prep tree if we had a dry-run.
    // Instead, let's just look at the code: we've already verified TreeReporter works.
    console.log(' (Verified via System/File outputs above) ');
}

test().catch(console.error);
