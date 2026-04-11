// src/utils/tree-reporter.js
// Universal utility for creating premium ANSI-colored tree-structured reports

const M = '\x1b[35m'; // Magenta
const C = '\x1b[36m'; // Cyan
const G = '\x1b[32m'; // Green
const Y = '\x1b[33m'; // Yellow
const D = '\x1b[90m'; // Dark Gray
const RST = '\x1b[0m'; // Reset

class TreeReporter {
    constructor(title, subTitle) {
        this.lines = [];
        this.lines.push(`  ${M}◈ ${title.toUpperCase()}${RST}`);
        if (subTitle) {
            this.lines.push(`  ${D}└─ ${subTitle}${RST}`);
        }
    }

    /**
     * Add a main branch
     */
    branch(label, value = '') {
        const valStr = value ? `: ${C}${value}${RST}` : '';
        this.lines.push(`  ${D}├─${RST} ${Y}${label}${RST}${valStr}`);
        return this;
    }

    /**
     * Add a sub-branch (leaf) under the last main branch
     */
    leaf(label, value = '') {
        const valStr = value ? `: ${G}${value}${RST}` : '';
        this.lines.push(`  ${D}│  └─${RST} ${label}${valStr}`);
        return this;
    }

    /**
     * Add a concluding line
     */
    complete(msg) {
        this.lines.push(`  ${D}└─${RST} ${G}✓ ${msg}${RST}`);
        return this;
    }

    /**
     * Get the final string
     */
    toString() {
        return this.lines.join('\n');
    }

    /**
     * Static helper for quick trees
     */
    static simple(title, branches = []) {
        const tree = new TreeReporter(title);
        branches.forEach(b => {
            if (typeof b === 'string') tree.branch(b);
            else if (b.label) tree.branch(b.label, b.value);
        });
        return tree.toString();
    }
}

module.exports = TreeReporter;
