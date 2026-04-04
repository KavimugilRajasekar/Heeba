const fs = require('fs');
const path = require('path');
const { getEmailAccount } = require('../../core/email-accounts');
const nodemailer = require('nodemailer');

const templatesPath = path.join(__dirname, 'templates.json');

const loadTemplates = () => {
    if (fs.existsSync(templatesPath)) {
        try { return JSON.parse(fs.readFileSync(templatesPath, 'utf8')); } catch (e) { return {}; }
    }
    return {};
};

module.exports = {
    quick_reply: async (params, context) => {
        const { getEmailAccount } = require('../../core/email-accounts');
        const account = getEmailAccount(params.account_id);
        if (!account) return { success: false, message: 'Email credentials not configured.' };

        const { to, subject, template_key, custom_text } = params;
        if (!to) return { success: false, message: 'Missing recipient.' };

        let body = custom_text || '';
        if (template_key) {
            const templates = loadTemplates();
            if (templates[template_key]) body = templates[template_key];
        }

        if (!body) return { success: false, message: 'Reply body is empty.' };

        const transporter = nodemailer.createTransport({
            host: account.smtp_host || account.smtp || 'smtp.gmail.com', port: account.smtp_port || 465,
            secure: (account.smtp_port || 465) === 465,
            auth: { user: account.email, pass: account.app_password || account.pass }
        });

        try {
            const info = await transporter.sendMail({
                from: account.email, to, subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`, text: body
            });
            return { success: true, message: `Quick reply sent to ${to}.` };
        } catch (err) { return { success: false, message: `Error: ${err.message}` }; }
    }
};
