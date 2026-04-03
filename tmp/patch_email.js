const fs = require('fs');

let content = fs.readFileSync('src/core/handlers/email-handler.js', 'utf8');

// 1. Remove getEmailCredentials definition
content = content.replace(/const getEmailCredentials = \(\) => \{[\s\S]*?\n\};/, '');

// 2. Add import for getEmailAccount near the top
content = content.replace(
  /const { queryOllama } = require\('\.\.\/ollama-adapter'\);/,
  "const { queryOllama } = require('../ollama-adapter');\nconst { getEmailAccount } = require('../email-accounts');"
);

// 3. Replace all const creds = getEmailCredentials();
content = content.replace(/const creds = getEmailCredentials\(\);/g, 'const account = getEmailAccount(params.account_id);');

// 4. Replace if (!creds) return
content = content.replace(/if \(!creds\)/g, 'if (!account)');

// 5. Replace creds.host || 'imap.gmail.com' with account.imap_host || account.host || 'imap.gmail.com'
content = content.replace(/host: creds\.host \|\| 'imap\.gmail\.com'/g, "host: account.imap_host || account.host || 'imap.gmail.com'");

// 6. Replace creds.port with account.port
content = content.replace(/port: creds\.port/g, "port: account.port");

// 7. Replace creds.user and creds.pass
content = content.replace(/user: creds\.user, pass: creds\.pass/g, "user: account.email, pass: account.app_password || account.pass");
content = content.replace(/from: `"\$\{config\.heeba_identity\.name\}" <\$\{creds\.user\}>`/g, 'from: `"${config.heeba_identity?.name || \'Heeba\'}" <${account.email}>`');
content = content.replace(/creds\.smtp/g, 'account.smtp_host || account.smtp');
content = content.replace(/creds\.smtp_port/g, 'account.smtp_port');

fs.writeFileSync('src/core/handlers/email-handler.js', content, 'utf8');
console.log('Patch complete.');
