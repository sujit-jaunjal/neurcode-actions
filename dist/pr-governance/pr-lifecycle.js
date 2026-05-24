"use strict";
/**
 * PR Operational Lifecycle (deterministic, per-push)
 * ==================================================
 *
 * The merged state alone can't tell "flagged then fixed" from "always coherent".
 * This tracks how a single PR's operational coherence evolves ACROSS PUSHES and
 * derives the convergence story — converged, fix-loop, persistent, or unresolved.
 *
 * The lifecycle is stored IN the PR comment itself (a hidden block), so there is
 * no separate telemetry pipeline: each run reads the prior lifecycle, appends the
 * current push's state, and re-derives the story. Only DISTINCT operational
 * states count (re-pushing the same diff — same scopeHash — is not a new state),
 * which keeps the timeline sparse. Pure ⇒ replay-safe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyLifecycle = emptyLifecycle;
exports.appendPush = appendPush;
exports.analyzeLifecycle = analyzeLifecycle;
exports.serializeLifecycle = serializeLifecycle;
exports.parseLifecycle = parseLifecycle;
const EMBED_PREFIX = '<!-- neurcode-lifecycle:';
const EMBED_SUFFIX = '-->';
function emptyLifecycle() { return { v: 1, pushes: [] }; }
/** Append the current push, collapsing no-op re-pushes (identical scopeHash). */
function appendPush(prior, current) {
    const pushes = prior?.pushes ? [...prior.pushes] : [];
    const last = pushes[pushes.length - 1];
    if (last && last.hash === current.hash)
        return { v: 1, pushes }; // no operational change
    pushes.push({ seq: pushes.length, verdict: current.verdict, codes: [...current.codes].sort(), hash: current.hash });
    return { v: 1, pushes };
}
function analyzeLifecycle(state) {
    const pushes = state.pushes;
    const distinctStates = pushes.length;
    const flag = (p) => p.verdict !== 'coherent';
    let fixes = 0;
    let regressions = 0;
    for (let i = 1; i < pushes.length; i++) {
        if (flag(pushes[i - 1]) && !flag(pushes[i]))
            fixes += 1;
        if (!flag(pushes[i - 1]) && flag(pushes[i]))
            regressions += 1;
    }
    const everFlagged = pushes.some(flag);
    const last = pushes[pushes.length - 1];
    const lastFlagged = last ? flag(last) : false;
    // Transient codes: signals that appeared at some point but are gone in the last state.
    const everCodes = new Set(pushes.flatMap((p) => p.codes));
    const lastCodes = new Set(last?.codes ?? []);
    const transientCodes = [...everCodes].filter((c) => !lastCodes.has(c)).sort();
    let convergence;
    if (distinctStates <= 1 && !everFlagged)
        convergence = 'clean';
    else if (!lastFlagged && everFlagged)
        convergence = (regressions >= 1 || fixes >= 2) ? 'fix-loop' : 'converged';
    else if (lastFlagged && pushes.every(flag))
        convergence = 'persistent';
    else if (lastFlagged)
        convergence = 'unresolved';
    else
        convergence = 'clean';
    return { convergence, distinctStates, fixes, regressions, transientCodes, narrative: narrate(convergence, distinctStates, fixes, regressions, transientCodes) };
}
function transientClause(codes) {
    if (codes.length === 0)
        return '';
    const label = {
        'generated-spillover': 'generated-code spillover', 'boundary-crossing': 'the boundary crossing',
        'new-operational-edge': 'the new operational edge', widening: 'operational widening',
        'low-surface-touches-significant': 'the significant-boundary touch', 'docs-change-touches-source': 'the docs/source widening',
    };
    const named = codes.map((c) => label[c] ?? c).slice(0, 2);
    return ` — ${named.join(' and ')} resolved along the way`;
}
function narrate(convergence, distinct, fixes, regressions, transient) {
    switch (convergence) {
        case 'clean': return null; // no story — silence
        case 'converged': return `Converged before merge — flagged earlier, resolved across ${distinct} operational states${transientClause(transient)}.`;
        case 'fix-loop': return `Entered repeated remediation loops (${fixes} fix / ${regressions} regression cycle${fixes + regressions === 1 ? '' : 's'}) before converging.`;
        case 'persistent': return `Operational incoherence has persisted across ${distinct} pushes — not yet converged.`;
        case 'unresolved': return `Not yet converged — re-flagged after an earlier coherent state.`;
        default: return null;
    }
}
// ── Hidden-comment serialisation (the per-PR store) ───────────────────────────
function serializeLifecycle(state) {
    // Compact: drop full hashes to short prefixes to keep the block small.
    const compact = { v: 1, pushes: state.pushes.map((p) => ({ s: p.seq, v: p.verdict, c: p.codes, h: p.hash.slice(0, 8) })) };
    return `${EMBED_PREFIX}${JSON.stringify(compact)}${EMBED_SUFFIX}`;
}
function parseLifecycle(commentBody) {
    if (!commentBody)
        return null;
    const start = commentBody.indexOf(EMBED_PREFIX);
    if (start === -1)
        return null;
    const end = commentBody.indexOf(EMBED_SUFFIX, start);
    if (end === -1)
        return null;
    const json = commentBody.slice(start + EMBED_PREFIX.length, end).trim();
    try {
        const obj = JSON.parse(json);
        if (!Array.isArray(obj.pushes))
            return null;
        return { v: 1, pushes: obj.pushes.map((p) => ({ seq: p.s, verdict: p.v, codes: Array.isArray(p.c) ? p.c : [], hash: p.h })) };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=pr-lifecycle.js.map