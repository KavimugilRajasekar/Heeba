const { queryOllama } = require('../../core/ollama-adapter');
const { getHeebaConfig } = require('../../core/config-loader');

module.exports = {
    narrate_inbox: async (params, context) => {
        const emails = params.emails || [];
        if (emails.length === 0) return { success: true, message: 'Sir, your inbox is completely empty.' };

        const info = emails.slice(0, 5).map(e => `- Mention ${e.from} mailed about "${e.subject}"`).join('\n');
        
        const prompt = `You are Heeba, a friendly and intelligent AI assistant. A user has received these 5 recent emails. Narrate the inbox state casually, organically, and using a humanized tone (e.g., "Hey, you've got an email from your boss about..."). Be concise.\n\n${info}`;
        
        const config = context.config || getHeebaConfig();
        try {
            const narrative = await queryOllama(prompt, 'manual', config, null);
            return { success: true, message: `🎙️  **Narrative:**\n\n${narrative}` };
        } catch (e) {
            return { success: false, message: `Heeba couldn't speak right now: ${e.message}` };
        }
    }
};
