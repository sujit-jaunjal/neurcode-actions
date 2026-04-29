"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEURCODE_RUN_ID_PLACEHOLDER = exports.NEURCODE_GOVERNANCE_REPORT_MARKER = void 0;
exports.resolveGovernanceVerdict = resolveGovernanceVerdict;
exports.formatGovernanceComment = formatGovernanceComment;
const drift_1 = require("./drift");
exports.NEURCODE_GOVERNANCE_REPORT_MARKER = '<!-- neurcode-governance-report -->';
exports.NEURCODE_RUN_ID_PLACEHOLDER = '{{NEURCODE_RUN_ID}}';
function escapeMarkdownInline(value) {
    return value.replace(/\|/g, '\\|').replace(/`/g, '\\`');
}
function hasCriticalViolations(data) {
    return data.violations.some((violation) => {
        const severity = (violation.severity || '').trim().toLowerCase();
        return severity === 'critical' || severity === 'high';
    });
}
function resolveGovernanceVerdict(data) {
    if (hasCriticalViolations(data)) {
        return 'blocked';
    }
    if (data.warnings.length > 0 || data.scopeIssues.length > 0) {
        return 'needs_attention';
    }
    return 'ready';
}
function renderVerdictLine(verdict) {
    if (verdict === 'blocked') {
        return '**Verdict:** ❌ Blocked';
    }
    if (verdict === 'needs_attention') {
        return '**Verdict:** ⚠️ Needs Attention';
    }
    return '**Verdict:** ✅ Ready to Merge';
}
function countBlockingViolations(data) {
    return data.violations.filter((violation) => {
        const severity = (violation.severity || '').trim().toLowerCase();
        return severity === 'critical' || severity === 'high';
    }).length;
}
function renderVerdictReason(verdict, data) {
    if (verdict !== 'blocked') {
        return null;
    }
    const criticalCount = countBlockingViolations(data);
    return `Reason: ${criticalCount} critical policy violations detected`;
}
function renderViolations(data) {
    const lines = ['### Policy Violations', ''];
    if (data.violations.length === 0) {
        lines.push('- No policy violations detected.');
        return lines;
    }
    for (const violation of data.violations) {
        lines.push(`- \`${escapeMarkdownInline(violation.file)}\` — ${escapeMarkdownInline(violation.message)} ` +
            `(policy: \`${escapeMarkdownInline(violation.policy)}\`, severity: \`${escapeMarkdownInline(violation.severity)}\`)`);
    }
    return lines;
}
function renderScopeIssues(data) {
    const lines = ['### Scope / Architectural Issues', ''];
    if (data.scopeIssues.length === 0) {
        lines.push('- No scope issues detected.');
        return lines;
    }
    for (const issue of data.scopeIssues) {
        lines.push(`- \`${escapeMarkdownInline(issue.file)}\` — ${escapeMarkdownInline(issue.message)}`);
    }
    return lines;
}
function renderSummary(data) {
    return [
        '### Summary',
        '',
        `- ${data.summary.totalFilesChanged} files changed`,
        `- ${data.summary.totalViolations} policy violations detected`,
    ];
}
function resolveDriftScore(data) {
    if (typeof data.driftScore === 'number' && Number.isFinite(data.driftScore)) {
        const bounded = Math.max(0, Math.min(100, data.driftScore));
        return Math.round(bounded);
    }
    return (0, drift_1.calculateDriftScore)(data);
}
function resolveDriftStatus(score) {
    if (score <= 30)
        return 'Low';
    if (score <= 70)
        return 'Moderate';
    return 'High';
}
function renderDriftScore(data) {
    const score = resolveDriftScore(data);
    const status = resolveDriftStatus(score);
    return [
        '### Drift Score',
        '',
        `- Drift score: **${score} / 100** (${status})`,
        '- Indicates deviation from intended architecture',
    ];
}
function renderWhatToDo(data, verdict) {
    const suggestions = [];
    const firstViolation = data.violations[0];
    if (firstViolation) {
        suggestions.push(`Start with \`${escapeMarkdownInline(firstViolation.file)}\`: ${escapeMarkdownInline(firstViolation.message)} (quick fix)`);
    }
    if (verdict === 'blocked') {
        suggestions.push('Resolve all critical policy violations before merge.');
    }
    if (data.scopeIssues.length > 0) {
        suggestions.push('Align out-of-scope file changes with the approved plan or update the plan context.');
    }
    if (data.warnings.length > 0) {
        suggestions.push('Review warning-level findings and reduce risk in the affected files.');
    }
    if (suggestions.length === 0) {
        suggestions.push('No immediate action required. Continue with standard review checks.');
    }
    suggestions.push('To fix quickly, run: `neurcode fix`');
    return ['### What To Do', '', ...suggestions.map((suggestion) => `- ${suggestion}`)];
}
function renderFooter() {
    return [
        '- Governed by Neurcode',
        '- Based on Neurcode policy and structural analysis',
        `- Run ID: ${exports.NEURCODE_RUN_ID_PLACEHOLDER}`,
        '- AI attribution not fully tracked yet',
    ];
}
function formatGovernanceComment(data) {
    const verdict = resolveGovernanceVerdict(data);
    const reason = renderVerdictReason(verdict, data);
    const sections = [
        exports.NEURCODE_GOVERNANCE_REPORT_MARKER,
        '## Neurcode Governance Report',
        '',
        renderVerdictLine(verdict),
        ...(reason ? ['', reason] : []),
        '',
        'Impact: This PR may introduce architectural inconsistencies and policy violations that could affect system stability.',
        '',
        '---',
        '',
        ...renderWhatToDo(data, verdict),
        '',
        '---',
        '',
        ...renderViolations(data),
        '',
        '---',
        '',
        ...renderScopeIssues(data),
        '',
        '---',
        '',
        ...renderSummary(data),
        '',
        '---',
        '',
        ...renderDriftScore(data),
        '',
        '---',
        '',
        ...renderFooter(),
    ];
    return sections.join('\n');
}
//# sourceMappingURL=formatter.js.map