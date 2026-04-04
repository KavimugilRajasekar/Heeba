module.exports = {
    parse_date_filter: (verbal) => {
        const d = new Date();
        verbal = verbal.toLowerCase();
        let since = new Date(d);
        let before = new Date(d);

        if (verbal === 'yesterday') {
            since.setDate(since.getDate() - 1);
            since.setHours(0, 0, 0, 0);
            before.setDate(before.getDate() - 1);
            before.setHours(23, 59, 59, 999);
        } else if (verbal === 'today') {
            since.setHours(0, 0, 0, 0);
        } else if (verbal === 'morning') {
            since.setHours(5, 0, 0, 0);
            before.setHours(12, 0, 0, 0);
        } else if (verbal === 'afternoon') {
            since.setHours(12, 0, 0, 0);
            before.setHours(17, 0, 0, 0);
        } else if (verbal === 'evening') {
            since.setHours(17, 0, 0, 0);
            before.setHours(21, 0, 0, 0);
        } else if (verbal === 'night') {
            since.setHours(21, 0, 0, 0);
            before.setDate(before.getDate() + 1);
            before.setHours(5, 0, 0, 0);
        }

        return { since, before };
    },
    test_date_filter: async (params, context) => {
        return { success: true, message: 'Date filter helper ready.' };
    }
};
