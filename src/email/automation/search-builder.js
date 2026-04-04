module.exports = {
    build_search_query: (filters) => {
        const criteria = {};
        if (filters.sender) criteria.from = filters.sender;
        if (filters.subject) criteria.subject = filters.subject;
        if (filters.unseen) criteria.unseen = true;
        if (filters.date) {
            criteria.since = new Date(filters.date);
            const before = new Date(filters.date);
            before.setDate(before.getDate() + 1);
            criteria.before = before;
        }
        return criteria;
    },
    test_search_builder: async (params, context) => {
        return { success: true, message: 'IMAP SEARCH Builder ready.' };
    }
};
