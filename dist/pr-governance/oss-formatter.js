"use strict";
/**
 * Compact OSS PR comment.
 *
 * Maintainers skim PR checks in seconds. This renderer optimises for that:
 * one verdict, one sentence, a tiny declared-vs-touched table, the few reasons
 * that matter, and a deduped advisory list of reliability findings. No A–F
 * grade, no score, no governance-posture / replay / evidence / decision-lineage
 * sections — those are enterprise concerns and are intentionally absent here.
 *
 * It reuses the same comment marker as the enterprise formatter so a repo that
 * later turns enterprise mode on upgrades the same PR comment in place.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEURCODE_RUN_ID_PLACEHOLDER = exports.NEURCODE_GOVERNANCE_REPORT_MARKER = void 0;
exports.dedupeStructural = dedupeStructural;
exports.formatOssScopeComment = formatOssScopeComment;
exports.formatOssStepSummary = formatOssStepSummary;
exports.shouldComment = shouldComment;
exports.resolveOssExit = resolveOssExit;
const pr_lifecycle_1 = require("./pr-lifecycle");
exports.NEURCODE_GOVERNANCE_REPORT_MARKER = '<!-- neurcode-governance-report -->';
exports.NEURCODE_RUN_ID_PLACEHOLDER = '{{NEURCODE_RUN_ID}}';
const MAX_REASONS = 3;
const MAX_EVIDENCE_PER_REASON = 3;
const MAX_STRUCTURAL_ROWS = 6;
const SUBSYSTEM_LABEL = {
    docs: 'docs',
    test: 'tests',
    ci: 'CI',
    build: 'build/deps',
    config: 'config',
    frontend: 'frontend',
    generated: 'generated code',
    sensitive: 'sensitive',
    source: 'source',
};
function esc(value) {
    return value.replace(/\|/g, '\\|').replace(/`/g, '\\`');
}
function verdictBadge(level) {
    if (level === 'incoherent')
        return '⛔ **Scope mismatch**';
    if (level === 'review')
        return '⚠️ **Worth a look**';
    return '✅ **Scope coherent**';
}
/** Dedupe structural findings by file+line+rule — collapses the policy-engine mirror. */
function dedupeStructural(findings) {
    const seen = new Set();
    const out = [];
    for (const f of findings) {
        const key = `${f.file}:${f.line ?? ''}:${f.ruleId.toUpperCase()}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(f);
    }
    return out.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.ruleId.localeCompare(b.ruleId));
}
function renderTouched(result) {
    const subs = result.blastRadius.subsystems;
    if (subs.length === 0)
        return '_(no files classified)_';
    return subs
        .map((s) => {
        const label = SUBSYSTEM_LABEL[s.subsystem] ?? s.subsystem;
        const tagSuffix = s.tags.length > 0 ? ` (${s.tags.join(', ')})` : '';
        const bold = s.significant === true || s.subsystem === 'sensitive';
        const text = `${label}${tagSuffix} ×${s.files.length}`;
        return bold ? `**${esc(text)}**` : esc(text);
    })
        .join(' · ');
}
function formatOssScopeComment(input) {
    const { result } = input;
    const declared = result.declared;
    const structural = dedupeStructural(input.structural);
    const kindLabel = declared.changeKind === 'unknown' ? 'unlabeled' : declared.changeKind;
    const issueRef = declared.linkedIssues.length > 0
        ? ` · linked #${declared.linkedIssues.join(', #')}`
        : '';
    // The operational narrative (deterministic) is the headline when present.
    const summary = result.narrative?.summary || result.headline;
    const statements = result.narrative?.statements ?? [];
    const lines = [
        exports.NEURCODE_GOVERNANCE_REPORT_MARKER,
        '## Neurcode — PR Scope Coherence',
        '',
        `${verdictBadge(result.level)} — ${esc(summary)}`,
        '',
        `> **Reads as:** \`${esc(kindLabel)}\`${issueRef}` + (declared.title ? ` — “${esc(declared.title)}”` : ''),
        `> **Actually touches:** ${renderTouched(result)}`,
        '',
    ];
    // Lifecycle: how operational coherence evolved across pushes (only when there's a story).
    if (input.lifecycle && input.lifecycle.pushes.length >= 2) {
        const a = (0, pr_lifecycle_1.analyzeLifecycle)(input.lifecycle);
        if (a.narrative)
            lines.push(`> **Lifecycle:** ${esc(a.narrative)}`, '');
    }
    // Sparse "operational read" — only when the narrative has something to say
    // beyond the verdict (i.e. flagged or mechanically-suppressed PRs).
    if (statements.length > 0) {
        lines.push('### Operational read', '');
        for (const s of statements.slice(0, MAX_REASONS)) {
            lines.push(`- ${esc(s.text)}`);
            const ev = (s.evidence ?? []).slice(0, MAX_EVIDENCE_PER_REASON).map((e) => `\`${esc(e)}\``);
            if (ev.length > 0) {
                const more = (s.evidence ?? []).length > MAX_EVIDENCE_PER_REASON
                    ? ` _+${(s.evidence ?? []).length - MAX_EVIDENCE_PER_REASON} more_` : '';
                lines.push(`  ${ev.join(', ')}${more}`);
            }
        }
        lines.push('');
    }
    if (structural.length > 0) {
        const shown = structural.slice(0, MAX_STRUCTURAL_ROWS);
        const omitted = structural.length - shown.length;
        lines.push('### Reliability checks (advisory)', '');
        for (const f of shown) {
            const loc = f.line ? `${f.file}:${f.line}` : f.file;
            lines.push(`- \`${esc(loc)}\` — ${esc(f.ruleId)} ${esc(f.title)}`);
        }
        if (omitted > 0)
            lines.push('', `> +${omitted} more in the CI log.`);
        lines.push('');
    }
    lines.push('---', `Deterministic · scope \`${result.scopeHash}\` · re-run on this commit to reproduce · run ${exports.NEURCODE_RUN_ID_PLACEHOLDER}`, '_Advisory — this never blocks your merge unless a maintainer turns that on. Neurcode checks operational boundaries (scope vs. blast radius), not code style; it runs alongside your code reviewer._');
    // Hidden, machine-readable per-PR lifecycle store (read on the next push).
    if (input.lifecycle && input.lifecycle.pushes.length > 0) {
        lines.push('', (0, pr_lifecycle_1.serializeLifecycle)(input.lifecycle));
    }
    return lines.join('\n');
}
/**
 * GitHub step-summary variant. Level-aware so a first-time maintainer is never
 * confused by silence: on a coherent PR it states plainly that "no comment" is
 * the EXPECTED result — not a broken or skipped run.
 */
function formatOssStepSummary(result) {
    const facts = [
        `- Reads as: \`${esc(result.declared.changeKind)}\``,
        `- Touches: ${result.blastRadius.subsystems.map((s) => `${s.subsystem}×${s.files.length}`).join(', ') || 'none'}`,
        `- Scope hash: \`${result.scopeHash}\` — re-run on the same commit to reproduce this exact verdict.`,
    ];
    if (result.level === 'coherent') {
        return [
            '## Neurcode — PR Scope Coherence',
            '',
            '✅ **Scope coherent — no PR comment posted. This is the expected result.**',
            '',
            "Neurcode stays silent on healthy PRs and speaks only when a change's actual blast radius diverges from what it says it does. It is advisory and never blocks your merge.",
            '',
            ...facts,
        ].join('\n');
    }
    return [
        '## Neurcode — PR Scope Coherence',
        '',
        `${verdictBadge(result.level)} — ${result.narrative?.summary || result.headline}`,
        '',
        'Neurcode posted one advisory comment on this PR. It is advisory and never blocks your merge unless a maintainer turns that on.',
        '',
        ...facts,
    ].join('\n');
}
/**
 * Silent-success comment policy: HIGH SIGNAL, LOW PRESENCE.
 * - 'flagged' (default): comment only on review/incoherent; coherent PRs stay
 *   quiet (a prior comment is still updated to resolved, but none is created).
 * - 'always': comment on every PR.  - 'never': CI outputs / step-summary only.
 */
function shouldComment(level, commentOn) {
    if (commentOn === 'never')
        return false;
    if (commentOn === 'always')
        return true;
    return level !== 'coherent';
}
/**
 * OSS exit semantics. Advisory by default — trust is the priority for a first
 * install. A maintainer can opt into hard-failing on mismatch once they trust
 * the signal (`scope_coherence_fail: true`).
 */
function resolveOssExit(input) {
    if (input.level === 'incoherent') {
        return input.failOnIncoherent
            ? { shouldFail: true, warning: 'Neurcode: PR scope mismatch (configured to block).' }
            : { shouldFail: false, warning: 'Neurcode: PR scope mismatch — advisory only.' };
    }
    if (input.level === 'review') {
        return { shouldFail: false, warning: 'Neurcode: PR scope worth a review.' };
    }
    return { shouldFail: false, warning: null };
}
//# sourceMappingURL=oss-formatter.js.map