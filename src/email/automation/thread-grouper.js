module.exports = {
    group_threads: async (params, context) => {
        const emails = params.emails || [];
        const threads = {};

        emails.forEach(email => {
            const topic = email.subject.replace(/^(Re|Fwd|Fw):\s*/i, '').trim();
            if (!threads[topic]) threads[topic] = [];
            threads[topic].push(email);
        });

        // Sort by date inside threads
        Object.keys(threads).forEach(t => {
            threads[t].sort((a, b) => new Date(a.date) - new Date(b.date));
        });

        return { success: true, message: `Grouped ${emails.length} emails into ${Object.keys(threads).length} threads.`, threads };
    }
};
