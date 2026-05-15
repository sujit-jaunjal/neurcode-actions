"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEURCODE_RUN_ID_PLACEHOLDER = exports.NEURCODE_GOVERNANCE_REPORT_MARKER = void 0;
exports.resolveGovernanceVerdict = resolveGovernanceVerdict;
exports.formatGovernanceComment = formatGovernanceComment;
exports.formatGovernanceStepSummary = formatGovernanceStepSummary;
const drift_1 = require("./drift");
exports.NEURCODE_GOVERNANCE_REPORT_MARKER = '<!-- neurcode-governance-report -->';
exports.NEURCODE_RUN_ID_PLACEHOLDER = '{{NEURCODE_RUN_ID}}';
/** Keeps PR comments scannable when many advisory rows exist — full list remains in verify JSON artifact. */
const MAX_ADVISORY_ROWS_IN_COMMENT = 15;
const MAX_GOVERNANCE_FINDINGS_IN_COMMENT = 6;
function escapeMarkdownInline(value) {
    return value.replace(/\|/g, '\\|').replace(/`/g, '\\`');
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function asString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asStringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === 'string' && item.trim().length > 0)
        : [];
}
function getGovernanceEnvelope(data) {
    return asRecord(data.governanceVerification);
}
function getIntentGovernance(data) {
    const envelope = getGovernanceEnvelope(data);
    return asRecord(envelope?.intentGovernance);
}
function getGovernancePosture(data) {
    const intent = getIntentGovernance(data);
    return asRecord(intent?.governancePosture) || asRecord(data.governancePosture);
}
function getGovernanceDecisions(data) {
    const intent = getIntentGovernance(data);
    return asRecord(intent?.governanceDecisions) || asRecord(data.governanceDecisions);
}
function getPriorityCounts(data) {
    const posture = getGovernancePosture(data);
    const counts = asRecord(posture?.priorityCounts);
    if (counts)
        return counts;
    const risk = asRecord(getIntentGovernance(data)?.riskSynthesis);
    return asRecord(risk?.priorityCounts);
}
function formatUnknown(value, fallback = 'not reported') {
    const str = asString(value);
    return str ? escapeMarkdownInline(str) : fallback;
}
function formatCount(value) {
    const num = asNumber(value);
    return num === null ? '0' : String(Math.max(0, Math.floor(num)));
}
function formatConfidence(value) {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
function findingEvidenceLocation(finding) {
    const file = finding.evidence?.filePath || finding.evidence?.excerpt || 'unknown';
    const line = typeof finding.evidence?.line === 'number' ? `:${finding.evidence.line}` : '';
    return `${file}${line}`;
}
function truncateText(value, max = 220) {
    const compact = value.replace(/\s+/g, ' ').trim();
    if (compact.length <= max)
        return compact;
    return `${compact.slice(0, max - 1)}…`;
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
function countBlockingGovernanceFindings(data) {
    return getGovernanceFindings(data).filter((finding) => finding.severity === 'BLOCKING').length;
}
function countAdvisoryGovernanceFindings(data) {
    return getGovernanceFindings(data).filter((finding) => finding.severity === 'ADVISORY').length;
}
function isSystemStatusWarning(warning) {
    // 'verify_result' is a CLI-emitted status indicator ("✅ Policy check passed"),
    // not a real advisory finding. Exclude it from the needs_attention verdict.
    const policy = (warning.policy || '').toLowerCase();
    return policy === 'verify_result';
}
function resolveGovernanceVerdict(data) {
    data = safeData(data);
    if (hasCriticalViolations(data) || data.scopeIssues.length > 0 || countBlockingGovernanceFindings(data) > 0) {
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
function countBlockingPolicyViolations(data) {
    return data.violations.filter((violation) => {
        if (isArtifactCheckViolation(violation))
            return false;
        const severity = (violation.severity || '').trim().toLowerCase();
        return severity === 'critical' || severity === 'high';
    }).length;
}
function countBlockingViolations(data) {
    return countBlockingPolicyViolations(data) + countBlockingGovernanceFindings(data);
}
function renderMergeSafety(verdict) {
    if (verdict === 'blocked') {
        return [
            '**Merge safety:** Not sufficient for merge under default Neurcode governance rules. Resolve blockers or record an explicit, replay-visible governance decision.',
        ];
    }
    if (verdict === 'needs_attention') {
        return [
            '**Merge safety:** Review required. Advisory or review-class findings are present; merge only if your rollout policy permits them.',
        ];
    }
    return [
        '**Merge safety:** No blocking governance findings in this verify snapshot; still subject to your organization’s other checks.',
    ];
}
function renderVerdictReason(verdict, data) {
    if (verdict !== 'blocked') {
        return null;
    }
    const policyBlockingCount = countBlockingPolicyViolations(data);
    const governanceBlockingCount = countBlockingGovernanceFindings(data);
    const scopeCount = data.scopeIssues.length;
    const parts = [];
    if (policyBlockingCount > 0)
        parts.push(`${policyBlockingCount} critical policy violation(s)`);
    if (governanceBlockingCount > 0)
        parts.push(`${governanceBlockingCount} blocking governance finding(s)`);
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
    const rowStrings = [];
    for (const v of advisory)
        rowStrings.push(renderViolationLine(v));
    for (const w of realWarnings) {
        rowStrings.push(`- \`${escapeMarkdownInline(w.file)}\` — ${escapeMarkdownInline(w.message)} ` +
            `(policy: \`${escapeMarkdownInline(w.policy)}\`)`);
    }
    const omitted = Math.max(0, rowStrings.length - MAX_ADVISORY_ROWS_IN_COMMENT);
    const shown = omitted > 0 ? rowStrings.slice(0, MAX_ADVISORY_ROWS_IN_COMMENT) : rowStrings;
    for (const row of shown)
        lines.push(row);
    if (omitted > 0) {
        lines.push('');
        lines.push(`> *${omitted} additional advisory row(s) omitted in this comment — open the full verify JSON artifact or CI log for the complete list.*`);
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
        '### Change Summary',
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
function renderHighlights(data) {
    const blocking = data.violations.filter((v) => {
        if (isArtifactCheckViolation(v))
            return false;
        const sev = (v.severity || '').toLowerCase();
        return sev === 'critical' || sev === 'high';
    });
    const scope = data.scopeIssues;
    const advisory = data.violations.filter((v) => {
        if (isArtifactCheckViolation(v))
            return false;
        const sev = (v.severity || '').toLowerCase();
        return sev !== 'critical' && sev !== 'high';
    });
    const realWarnings = data.warnings.filter((w) => !isSystemStatusWarning(w));
    const top = [
        ...blocking,
        ...scope.map((s) => ({ file: s.file, message: s.message, policy: 'scope_guard', severity: 'high' })),
        ...advisory,
        ...realWarnings.map((w) => ({ file: w.file, message: w.message, policy: w.policy, severity: 'warning' })),
    ].slice(0, 3);
    if (top.length === 0)
        return [];
    return [
        '**Highlights:**',
        '',
        ...top.map((item) => `- ${escapeMarkdownInline(item.message)} in \`${escapeMarkdownInline(item.file)}\``),
    ];
}
function getGovernanceFindings(data) {
    if (Array.isArray(data.governanceFindings))
        return data.governanceFindings;
    const envelope = data.governanceVerification;
    if (envelope && Array.isArray(envelope.findings))
        return envelope.findings;
    return [];
}
function resolveRolloutTrust(data, verdict) {
    const posture = getGovernancePosture(data);
    const intent = getIntentGovernance(data);
    return asString(posture?.rolloutTrust)
        || asString(intent?.rolloutTrust)
        || (verdict === 'blocked' ? 'boundary-violating' : verdict === 'needs_attention' ? 'review-required' : 'rollout-safe');
}
function resolveGovernanceGate(data, verdict) {
    const posture = getGovernancePosture(data);
    const intent = getIntentGovernance(data);
    return asString(posture?.governanceGate)
        || asString(intent?.governanceGate)
        || (verdict === 'blocked' ? 'review-blocker' : 'advisory');
}
function renderGovernancePosture(data, verdict) {
    const posture = getGovernancePosture(data);
    const intent = getIntentGovernance(data);
    const decisions = getGovernanceDecisions(data);
    const counts = getPriorityCounts(data);
    const rolloutTrust = resolveRolloutTrust(data, verdict);
    const governanceGate = resolveGovernanceGate(data, verdict);
    const riskSummary = asString(intent?.riskSummary) || asString(posture?.summary);
    const postureReasons = asStringArray(posture?.reasons).slice(0, 3);
    const lines = [
        '### Governance Posture',
        '',
        '| Dimension | Result |',
        '| --- | --- |',
        `| Governance posture | ${escapeMarkdownInline(verdict.replace('_', ' '))} |`,
        `| Rollout trust | \`${escapeMarkdownInline(rolloutTrust)}\` |`,
        `| Governance gate | \`${escapeMarkdownInline(governanceGate)}\` |`,
        `| Rollout blockers | ${formatCount(counts?.p0RolloutBlockers)} |`,
        `| Architecture blockers | ${formatCount(counts?.p1ArchitectureBlockers)} |`,
        `| Review-required findings | ${formatCount(counts?.p2ReviewRequired)} |`,
        `| Advisories | ${formatCount(counts?.p3Advisory)} |`,
        `| Governance decisions applied | ${formatCount(decisions?.decisionsApplied)} |`,
        '',
    ];
    if (riskSummary) {
        lines.push(`**Why:** ${escapeMarkdownInline(truncateText(riskSummary, 280))}`);
    }
    else if (postureReasons.length > 0) {
        lines.push(`**Why:** ${postureReasons.map((item) => escapeMarkdownInline(item)).join('; ')}`);
    }
    else {
        lines.push('**Why:** No direct governance escalation reason was attached to this verify artifact.');
    }
    if (postureReasons.length > 0) {
        lines.push('');
        for (const reason of postureReasons) {
            lines.push(`- ${escapeMarkdownInline(truncateText(reason, 180))}`);
        }
    }
    return lines;
}
function renderGovernanceDecisions(data) {
    const decisions = getGovernanceDecisions(data);
    if (!decisions) {
        return [
            '### Governance Decisions',
            '',
            '- No accepted-risk, temporary-exception, review, or override lineage was attached to this verify artifact.',
            '- To author a repo-local decision: `neurcode governance accept-risk`, `neurcode governance temporary-exception`, or `neurcode governance review`.',
        ];
    }
    const lineageRaw = Array.isArray(decisions.lineage) ? decisions.lineage : [];
    const lineage = lineageRaw
        .map((item) => asRecord(item))
        .filter((item) => item !== null)
        .slice(0, 6);
    const lines = [
        '### Governance Decisions',
        '',
        `- Applied decisions: **${formatCount(decisions.decisionsApplied)}**`,
        `- Active overrides: **${formatCount(decisions.activeOverrides)}**`,
        `- Expired overrides / invalid entries: **${formatCount(decisions.expiredOverrides)}**`,
        `- Findings changed by decisions: **${formatCount(decisions.findingsChanged)}**`,
    ];
    const sourcePath = asString(decisions.sourcePath);
    if (sourcePath) {
        lines.push(`- Source: \`${escapeMarkdownInline(sourcePath)}\``);
    }
    if (lineage.length > 0) {
        lines.push('');
        lines.push('| Decision | State | Finding | Actor | Effect |');
        lines.push('| --- | --- | --- | --- | --- |');
        for (const entry of lineage) {
            const state = formatUnknown(entry.state, 'unknown');
            const decisionId = formatUnknown(entry.decisionId, 'unknown');
            const findingId = formatUnknown(entry.findingId, 'n/a');
            const actor = formatUnknown(entry.actor, 'unknown');
            const previous = formatUnknown(entry.previousGate, 'none');
            const resulting = formatUnknown(entry.resultingGate, 'none');
            const expired = entry.expired === true ? 'expired; ' : '';
            lines.push(`| \`${decisionId}\` | \`${state}\` | \`${findingId}\` | ${actor} | ${expired}\`${previous}\` → \`${resulting}\` |`);
        }
    }
    return lines;
}
function renderPrioritizedGovernanceFindings(data) {
    const findings = getGovernanceFindings(data)
        .filter((finding) => finding.sourceSystem === 'intent-engine' || finding.severity === 'BLOCKING')
        .sort((a, b) => {
        const sevRank = (v) => (v.severity === 'BLOCKING' ? 2 : v.severity === 'ADVISORY' ? 1 : 0);
        return sevRank(b) - sevRank(a) || b.confidence - a.confidence;
    });
    if (findings.length === 0) {
        return [
            '### Priority Findings',
            '',
            '- No canonical governance findings require reviewer attention in this verify snapshot.',
        ];
    }
    const shown = findings.slice(0, MAX_GOVERNANCE_FINDINGS_IN_COMMENT);
    const omitted = Math.max(0, findings.length - shown.length);
    const lines = [
        '### Priority Findings',
        '',
    ];
    for (const finding of shown) {
        lines.push(`#### ${finding.severity === 'BLOCKING' ? 'Blocking' : 'Advisory'}: ${escapeMarkdownInline(finding.title)}`);
        lines.push(`- **Why it matters:** ${escapeMarkdownInline(truncateText(finding.operationalImplication || finding.title, 260))}`);
        lines.push(`- **Evidence:** \`${escapeMarkdownInline(findingEvidenceLocation(finding))}\` ` +
            `(${escapeMarkdownInline(finding.determinismClassification)}, confidence ${formatConfidence(finding.confidence)})`);
        lines.push(`- **Boundary / category:** \`${escapeMarkdownInline(finding.category)}\` from \`${escapeMarkdownInline(finding.sourceSystem)}\``);
        lines.push(`- **Minimal correction path:** ${escapeMarkdownInline(truncateText(finding.remediation || 'Review and correct the bounded governance violation.', 260))}`);
        lines.push('');
    }
    if (omitted > 0) {
        lines.push(`> ${omitted} additional governance finding(s) omitted from the PR comment. Review the verify JSON artifact for the complete set.`);
    }
    return lines;
}
function renderReplayProvenance(data) {
    const gv = data.governanceVerification;
    const lines = [
        '### Replay / Evidence',
        '',
    ];
    if (!gv) {
        lines.push('- Canonical **governanceVerification** envelope missing — `replayChecksum` and replay integrity are unavailable.');
        lines.push('- **Governance findings** (if any) are still authoritative for merge decisions.');
        lines.push('');
        lines.push('> Replay metadata describes reproducibility of the envelope, not runtime correctness of your application.');
        return lines;
    }
    if (typeof gv.replayChecksum === 'string' && gv.replayChecksum.length > 0) {
        lines.push(`- **replayChecksum:** \`${gv.replayChecksum.slice(0, 18)}…\` (full hash in JSON verify output)`);
    }
    else {
        lines.push('- **replayChecksum:** not recorded — use current CLI `verify --json` to emit checksums where enabled.');
    }
    const ri = gv.replayIntegrity;
    if (ri) {
        lines.push(`- **Replay integrity:** \`${escapeMarkdownInline(String(ri.status))}\``);
        const missing = ri.missingArtifacts ?? [];
        if (missing.length > 0) {
            lines.push(`- **Missing / degraded dimensions:** ${missing.slice(0, 4).map(escapeMarkdownInline).join('; ')}`);
        }
        const notes = ri.notes ?? [];
        for (const n of notes.slice(0, 2)) {
            lines.push(`- ${escapeMarkdownInline(n)}`);
        }
    }
    else {
        lines.push('- **Replay integrity:** not attached (no envelope drift analysis for this run).');
    }
    lines.push('');
    lines.push('- **Evidence artifact:** upload `.neurcode/evidence/` from CI so reviewers can inspect the governance envelope and replay lineage.');
    lines.push('- **Remediation export:** use `neurcode remediate-export --finding-index 0` for bounded external remediation context.');
    lines.push('');
    lines.push('> Replay metadata supports auditability of governance output. It is not a claim that the application is behaviorally correct.');
    return lines;
}
function renderSuggestedAction(verdict) {
    if (verdict === 'ready') {
        return ['**Suggested Action:** No governance action required from Neurcode. Continue with standard code review and rollout checks.'];
    }
    return [
        '**Suggested Action:**',
        '',
        'Export deterministic remediation context for the highest-priority finding:',
        '```',
        'neurcode remediate-export --finding-index 0',
        '```',
        '',
        'Apply the correction outside Neurcode, then re-verify:',
        '```',
        'neurcode verify --ci',
        '```',
    ];
}
function renderWhatToDo(data, verdict) {
    const suggestions = [];
    const firstViolation = data.violations[0];
    if (firstViolation) {
        suggestions.push(`Prioritize \`${escapeMarkdownInline(firstViolation.file)}\`: ${escapeMarkdownInline(firstViolation.message)}`);
    }
    if (verdict === 'blocked') {
        suggestions.push('Resolve blocking governance findings or record an explicit, bounded governance decision before merge.');
    }
    if (data.scopeIssues.length > 0) {
        suggestions.push('Align out-of-scope file changes with the approved intent contract, or update the contract and re-run verify.');
    }
    if (data.warnings.filter((w) => !isSystemStatusWarning(w)).length > 0) {
        suggestions.push('Review warning-level findings and reduce risk in the affected files.');
    }
    if (suggestions.length === 0) {
        suggestions.push('No immediate action required. Continue with standard review checks.');
    }
    return ['### Details', '', ...suggestions.map((suggestion) => `- ${suggestion}`)];
}
function renderFooter() {
    return [
        '- Governed by Neurcode (deterministic structural + configured policy)',
        `- Run ID: ${exports.NEURCODE_RUN_ID_PLACEHOLDER}`,
        '- For replay/evidence retention in CI, upload `.neurcode/evidence/`, `.neurcode/governance-decisions.json`, and snapshots if enabled as job artifacts.',
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
    const blockingCount = countBlockingViolations(data);
    const advisoryCount = data.violations.filter((v) => {
        if (isArtifactCheckViolation(v))
            return false;
        const sev = (v.severity || '').toLowerCase();
        return sev !== 'critical' && sev !== 'high';
    }).length + data.warnings.filter((w) => !isSystemStatusWarning(w)).length + countAdvisoryGovernanceFindings(data);
    const highlights = renderHighlights(data);
    const governancePosture = renderGovernancePosture(data, verdict);
    const governanceDecisions = renderGovernanceDecisions(data);
    const priorityFindings = renderPrioritizedGovernanceFindings(data);
    const sections = [
        exports.NEURCODE_GOVERNANCE_REPORT_MARKER,
        '## Neurcode Governance Report',
        '',
        // ── Quick status ────────────────────────────────────────────────────────
        renderVerdictLine(verdict),
        ...(reason ? ['', reason] : []),
        '',
        ...renderMergeSafety(verdict),
        '',
        `**Blocking Issues:** ${blockingCount}`,
        `**Advisory:** ${advisoryCount}`,
        '',
        ...governancePosture,
        '',
        // ── Highlights (top 3 issues, scannable) ────────────────────────────────
        ...(highlights.length > 0 ? [...highlights, ''] : []),
        ...priorityFindings,
        '',
        ...renderReplayProvenance(data),
        '',
        ...governanceDecisions,
        '',
        // ── Suggested action ────────────────────────────────────────────────────
        ...renderSuggestedAction(verdict),
        '',
        '---',
        '',
        '<details>',
        '<summary>Detailed verify rows</summary>',
        '',
        // ── Detailed breakdown ───────────────────────────────────────────────────
        ...renderBlockingViolations(data),
        '',
        '---',
        '',
        ...renderScopeIssues(data),
        '',
        '---',
        '',
        ...renderAdvisoryViolations(data),
        '',
        '---',
        '',
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
        ...(artifactChecks ? [...artifactChecks, '', '---', ''] : []),
        '</details>',
        '',
        ...renderFooter(),
    ];
    return sections.join('\n');
}
function formatGovernanceStepSummary(data) {
    data = safeData(data);
    const verdict = resolveGovernanceVerdict(data);
    const blockingCount = countBlockingViolations(data);
    const advisoryCount = data.violations.filter((v) => {
        if (isArtifactCheckViolation(v))
            return false;
        const sev = (v.severity || '').toLowerCase();
        return sev !== 'critical' && sev !== 'high';
    }).length + data.warnings.filter((w) => !isSystemStatusWarning(w)).length + countAdvisoryGovernanceFindings(data);
    const rolloutTrust = resolveRolloutTrust(data, verdict);
    const governanceGate = resolveGovernanceGate(data, verdict);
    const decisions = getGovernanceDecisions(data);
    const replayStatus = asString(getGovernanceEnvelope(data)?.replayIntegrity && asRecord(getGovernanceEnvelope(data)?.replayIntegrity)?.status)
        || 'not attached';
    const findings = getGovernanceFindings(data)
        .sort((a, b) => {
        const sevRank = (v) => (v.severity === 'BLOCKING' ? 2 : v.severity === 'ADVISORY' ? 1 : 0);
        return sevRank(b) - sevRank(a) || b.confidence - a.confidence;
    })
        .slice(0, 5);
    const lines = [
        '## Neurcode Governance',
        '',
        `**Verdict:** ${verdict.replace('_', ' ')}`,
        '',
        '| Dimension | Result |',
        '| --- | --- |',
        `| Rollout trust | \`${escapeMarkdownInline(rolloutTrust)}\` |`,
        `| Governance gate | \`${escapeMarkdownInline(governanceGate)}\` |`,
        `| Blocking issues | ${blockingCount} |`,
        `| Advisory/review issues | ${advisoryCount} |`,
        `| Replay integrity | \`${escapeMarkdownInline(replayStatus)}\` |`,
        `| Governance decisions applied | ${formatCount(decisions?.decisionsApplied)} |`,
        '',
    ];
    if (findings.length > 0) {
        lines.push('### Priority Findings', '');
        findings.forEach((finding) => {
            lines.push(`- **${escapeMarkdownInline(finding.title)}** — ${escapeMarkdownInline(truncateText(finding.operationalImplication, 180))} ` +
                `(\`${escapeMarkdownInline(finding.category)}\`, ${finding.severity.toLowerCase()})`);
        });
        lines.push('');
    }
    lines.push('Artifacts to retain: `.neurcode/evidence/`, verify JSON, and `.neurcode/governance-decisions.json` when decisions are used.');
    return lines.join('\n');
}
//# sourceMappingURL=formatter.js.map