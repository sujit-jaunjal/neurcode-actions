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
function isArtifactCheckViolation(violation) {
    const policy = (violation.policy || '').toLowerCase();
    return policy === 'deterministic_artifacts_required' || policy === 'signed_artifacts_required';
}
function hasCriticalViolations(data) {
    return data.violations.some((violation) => {
        // Artifact presence/signature checks are advisory and must never drive the blocked verdict.
        if (isArtifactCheckViolation(violation))
            return false;
        const severity = (violation.severity || '').trim().toLowerCase();
        return severity === 'critical' || severity === 'high';
    });
}
function isSystemStatusWarning(warning) {
    // 'verify_result' is a CLI-emitted status indicator ("✅ Policy check passed"),
    // not a real advisory finding. Exclude it from the needs_attention verdict.
    const policy = (warning.policy || '').toLowerCase();
    return policy === 'verify_result';
}
function resolveGovernanceVerdict(data) {
    data = safeData(data);
    if (hasCriticalViolations(data) || data.scopeIssues.length > 0) {
        return 'blocked';
    }
    const realViolations = data.violations.filter((v) => !isArtifactCheckViolation(v));
    const realWarnings = data.warnings.filter((w) => !isSystemStatusWarning(w));
    if (realViolations.length > 0 || realWarnings.length > 0) {
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
        if (isArtifactCheckViolation(violation))
            return false;
        const severity = (violation.severity || '').trim().toLowerCase();
        return severity === 'critical' || severity === 'high';
    }).length;
}
function renderVerdictReason(verdict, data) {
    if (verdict !== 'blocked') {
        return null;
    }
    const blockingCount = countBlockingViolations(data);
    const scopeCount = data.scopeIssues.length;
    const parts = [];
    if (blockingCount > 0)
        parts.push(`${blockingCount} critical policy violation(s)`);
    if (scopeCount > 0)
        parts.push(`${scopeCount} scope/architectural issue(s)`);
    return `Reason: ${parts.length > 0 ? parts.join(', ') : 'blocking governance issues'} detected`;
}
function renderViolationLine(violation) {
    return (`- \`${escapeMarkdownInline(violation.file)}\` — ${escapeMarkdownInline(violation.message)} ` +
        `(policy: \`${escapeMarkdownInline(violation.policy)}\`, severity: \`${escapeMarkdownInline(violation.severity)}\`)`);
}
function renderBlockingViolations(data) {
    const blocking = data.violations.filter((v) => {
        if (isArtifactCheckViolation(v))
            return false;
        const sev = (v.severity || '').toLowerCase();
        return sev === 'critical' || sev === 'high';
    });
    const lines = ['### Blocking Violations', ''];
    if (blocking.length === 0) {
        lines.push('- No blocking policy violations detected.');
        return lines;
    }
    for (const v of blocking)
        lines.push(renderViolationLine(v));
    return lines;
}
function renderAdvisoryViolations(data) {
    const advisory = data.violations.filter((v) => {
        if (isArtifactCheckViolation(v))
            return false;
        const sev = (v.severity || '').toLowerCase();
        return sev !== 'critical' && sev !== 'high';
    });
    const realWarnings = data.warnings.filter((w) => !isSystemStatusWarning(w));
    const lines = ['### Advisory Violations', ''];
    if (advisory.length === 0 && realWarnings.length === 0) {
        lines.push('- No advisory issues detected.');
        return lines;
    }
    for (const v of advisory)
        lines.push(renderViolationLine(v));
    for (const w of realWarnings) {
        lines.push(`- \`${escapeMarkdownInline(w.file)}\` — ${escapeMarkdownInline(w.message)} ` +
            `(policy: \`${escapeMarkdownInline(w.policy)}\`)`);
    }
    return lines;
}
function renderArtifactChecks(data) {
    const artifactIssues = data.violations.filter(isArtifactCheckViolation);
    if (artifactIssues.length === 0)
        return null;
    const lines = ['### Artifact Checks (Advisory)', ''];
    for (const v of artifactIssues) {
        lines.push(`- \`${escapeMarkdownInline(v.file)}\` — ${escapeMarkdownInline(v.message)} ` +
            `(policy: \`${escapeMarkdownInline(v.policy)}\`)`);
    }
    lines.push('');
    lines.push('> Artifact checks are advisory and do not block merge.');
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
    if (data.warnings.filter((w) => !isSystemStatusWarning(w)).length > 0) {
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
function safeData(data) {
    return {
        ...data,
        violations: Array.isArray(data.violations) ? data.violations : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        scopeIssues: Array.isArray(data.scopeIssues) ? data.scopeIssues : [],
        summary: data.summary ?? { totalFilesChanged: 0, totalViolations: 0, totalWarnings: 0, totalScopeIssues: 0 },
    };
}
function formatGovernanceComment(data) {
    data = safeData(data);
    const verdict = resolveGovernanceVerdict(data);
    const reason = renderVerdictReason(verdict, data);
    const artifactChecks = renderArtifactChecks(data);
    const sections = [
        exports.NEURCODE_GOVERNANCE_REPORT_MARKER,
        '## Neurcode Governance Report',
        '',
        renderVerdictLine(verdict),
        ...(reason ? ['', reason] : []),
        '',
        '---',
        '',
        // 1. BLOCKING issues
        ...renderBlockingViolations(data),
        '',
        '---',
        '',
        // 2. Scope / architectural issues
        ...renderScopeIssues(data),
        '',
        '---',
        '',
        // 3. Advisory issues (warnings + low-severity violations)
        ...renderAdvisoryViolations(data),
        '',
        '---',
        '',
        // 4. Drift score
        ...renderDriftScore(data),
        '',
        '---',
        '',
        ...renderSummary(data),
        '',
        '---',
        '',
        ...renderWhatToDo(data, verdict),
        '',
        '---',
        '',
        // 5. Artifact checks (optional, advisory only)
        ...(artifactChecks ? [...artifactChecks, '', '---', ''] : []),
        ...renderFooter(),
    ];
    return sections.join('\n');
}
//# sourceMappingURL=formatter.js.map