const fs = require('fs');
const path = require('path');

const rulesPath = path.join(__dirname, 'rules.json');

const loadRules = () => {
    if (fs.existsSync(rulesPath)) {
        try {
            return JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
        } catch (e) {
            return { rules: [] };
        }
    }
    return { rules: [] };
};

// Applies rules actions like mark_read, archive, etc.
// In this basic version we just return the recommended actions based on the email subject/from.
const applyRuleActions = (email, rules) => {
    let actions = [];
    for (const rule of rules) {
        let match = false;
        if (rule.condition.from && email.from.includes(rule.condition.from)) match = true;
        if (rule.condition.subject && email.subject.includes(rule.condition.subject)) match = true;
        
        if (match) {
            actions.push(...rule.actions);
        }
    }
    return actions;
};

module.exports = {
    apply_rules: async (params, context) => {
        const { rules } = loadRules();
        if (rules.length === 0) return { success: true, message: 'No automation rules configured.' };
        return { success: true, message: `Active rules loaded: ${rules.length}` };
    }
};
