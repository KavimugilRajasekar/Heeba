const fs = require('fs');
let file = fs.readFileSync('src/core/handlers/email-handler.js', 'utf8');

if (!file.includes("const nodemailer = require('nodemailer');")) {
  file = file.replace("const { convert } = require('html-to-text');\n", "const { convert } = require('html-to-text');\nconst nodemailer = require('nodemailer');\n");
}

const appendLogic = `
  add_email_account: async (params) => {
    const { id, email, app_password, imap_host, smtp_host } = params;
    if (!email || !app_password) return { success: false, message: 'Missing required fields: email, app_password' };
    const { addEmailAccount, testEmailAccount } = require('../email-accounts');
    const account = {
      id: id || \`account_\${Date.now()}\`,
      email,
      app_password,
      imap_host: imap_host || 'imap.gmail.com',
      smtp_host: smtp_host || 'smtp.gmail.com'
    };
    const test = await testEmailAccount(account);
    if (!test.success) return { success: false, message: \`Connection test failed: \${test.message}\` };
    addEmailAccount(account);
    return { success: true, message: \`Email account "\${email}" added successfully!\` };
  },

  send_email: async (params) => {
    const { getEmailAccount } = require('../email-accounts');
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    let { to, subject, body, attachments } = params;
    if (!to || !subject || !body) return { success: false, message: 'Missing recipient (to), subject, or body.' };

    const { getHeebaConfig } = require('../config-loader');
    const config = getHeebaConfig();
    if (to.toLowerCase() === 'reception') {
      if (config.user_profile && config.user_profile.reception_email) {
        to = config.user_profile.reception_email;
      }
    }

    const transporter = nodemailer.createTransport({
      host: account.smtp_host || account.smtp || 'smtp.gmail.com',
      port: account.smtp_port || 465,
      secure: (account.smtp_port || 465) === 465,
      auth: { user: account.email, pass: account.app_password || account.pass }
    });

    const mailOptions = {
      from: \`"\${config.heeba_identity?.name || 'Heeba'}" <\${account.email}>\`,
      to,
      subject,
      text: body
    };

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const path = require('path');
      const fsLocal = require('fs');
      mailOptions.attachments = attachments.map(filePath => {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        if (fsLocal.existsSync(absolutePath)) {
          return { filename: path.basename(absolutePath), path: absolutePath };
        } else {
          throw new Error(\`Attachment file not found: \${filePath}\`);
        }
      });
    } else if (attachments && typeof attachments === 'string') {
        const path = require('path');
        const fsLocal = require('fs');
        const absolutePath = path.isAbsolute(attachments) ? attachments : path.join(process.cwd(), attachments);
        if (fsLocal.existsSync(absolutePath)) {
          mailOptions.attachments = [{ filename: path.basename(absolutePath), path: absolutePath }];
        } else {
          throw new Error(\`Attachment file not found: \${attachments}\`);
        }
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      let msg = \`Email sent successfully to \${to}! (ID: \${info.messageId})\`;
      if (mailOptions.attachments && mailOptions.attachments.length > 0) msg += \` with \${mailOptions.attachments.length} attachment(s).\`;
      return { success: true, message: msg };
    } catch (err) { return { success: false, message: \`SMTP Error: \${err.message}\` }; }
  }
};
module.exports = emailHandlers;
`;

file = file.replace(/\s*\}\s*;\s*module\.exports\s*=\s*emailHandlers;[\s\S]*/, ',' + appendLogic);
fs.writeFileSync('src/core/handlers/email-handler.js', file, 'utf8');
console.log('Done!');
