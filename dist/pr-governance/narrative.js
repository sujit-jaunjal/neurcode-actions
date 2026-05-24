"use strict";
/**
 * Deterministic operational narrative synthesis
 * =============================================
 *
 * Turns the engine's structured facts (declared lane, touched operational
 * areas, module topology, centrality fan-in, import-edge crossings, mechanical
 * class) into a sparse, operationally-grounded explanation — so a maintainer
 * feels the system understands the *operational shape* of the PR.
 *
 * It is NOT a code reviewer and NOT an AI summariser. Every sentence is a
 * deterministic template filled from facts already computed by the coherence
 * engine. Same result ⇒ same narrative ⇒ replay-safe. Narratives are sparse:
 * a trivial coherent PR gets one short line (or none beyond the verdict).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationalArea = operationalArea;
exports.synthesizeNarrative = synthesizeNarrative;
const repo_topology_1 = require("./repo-topology");
const AREA_LABEL = {
    auth: 'the authentication boundary',
    crypto: 'security / cryptography',
    payments: 'the payments boundary',
    persistence: 'persistence / data storage',
    'runtime-entrypoint': 'runtime entrypoints',
    infrastructure: 'infrastructure / deploy surfaces',
    generated: 'generated code',
    ui: 'UI / rendering',
    'runtime-source': 'runtime source',
};
const PERSISTENCE_TOKENS = new Set([
    'db', 'database', 'persistence', 'sqlite', 'postgres', 'mysql', 'orm', 'dao',
    'repository', 'repositories', 'schema', 'store', 'storage', 'migrations', 'migration',
]);
const FRONTEND_EXTS = new Set(['tsx', 'jsx', 'vue', 'svelte', 'css', 'scss', 'less', 'html']);
function tokensOf(p) { return p.toLowerCase().split(/[/\\._\-]+/).filter(Boolean); }
function extOf(p) { const b = p.split('/').pop() || p; const d = b.lastIndexOf('.'); return d > 0 ? b.slice(d + 1).toLowerCase() : ''; }
/** Deterministic operational area for a path. */
function operationalArea(path) {
    const role = (0, repo_topology_1.roleOf)(path);
    if (role === 'entrypoint')
        return 'runtime-entrypoint';
    if (role === 'infra')
        return 'infrastructure';
    if (role === 'generated')
        return 'generated';
    const sec = (0, repo_topology_1.significantSecurityTagFor)(path);
    if (sec === 'auth' || sec === 'authz')
        return 'auth';
    if (sec === 'crypto' || sec === 'secrets' || sec === 'security')
        return 'crypto';
    if (sec === 'payments' || sec === 'billing')
        return 'payments';
    if (sec === 'migrations')
        return 'persistence';
    if (tokensOf(path).some((t) => PERSISTENCE_TOKENS.has(t)))
        return 'persistence';
    const segs = path.toLowerCase().split('/');
    if (FRONTEND_EXTS.has(extOf(path)) || segs.includes('components') || segs.includes('ui') || segs.includes('pages') || segs.includes('views'))
        return 'ui';
    return 'runtime-source';
}
// Article-free adjectives so templates read cleanly as "This <lane> change …".
const LANE = {
    docs: 'documentation', test: 'test', chore: 'maintenance', fix: 'fix',
    refactor: 'refactor', feature: 'feature', unknown: 'unlabelled',
};
function uniqueSorted(xs) { return [...new Set(xs)].sort(); }
function joinList(xs) {
    if (xs.length === 0)
        return 'nothing';
    if (xs.length === 1)
        return xs[0];
    if (xs.length === 2)
        return `${xs[0]} and ${xs[1]}`;
    return `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`;
}
// ── Synthesis ─────────────────────────────────────────────────────────────────
function synthesizeNarrative(result, profile) {
    const kind = result.declared.changeKind;
    const lane = LANE[kind] ?? 'unlabelled';
    const allFiles = uniqueSorted(result.blastRadius.subsystems.flatMap((s) => s.files));
    const codeModules = profile
        ? uniqueSorted(allFiles.filter((f) => { const r = (0, repo_topology_1.roleOf)(f); return r === 'source' || r === 'entrypoint'; }).map((f) => (0, repo_topology_1.subsystemOf)(f, profile)))
        : [];
    const reason = (code) => result.reasons.find((r) => r.code === code);
    const areaLabelsFor = (files) => uniqueSorted(files.map((f) => AREA_LABEL[operationalArea(f)]));
    const statements = [];
    if (result.mechanical?.isMechanical) {
        statements.push({
            code: 'mechanical',
            text: `Recognised as a ${result.mechanical.mechanicalClass} change — ${result.mechanical.reason}. Wide-diff coherence signals were suppressed; boundary and import-edge checks still applied.`,
        });
    }
    // Significance reason: topology path emits 'low-surface-touches-significant';
    // the fixed-taxonomy path emits 'low-surface-touches-sensitive'. Handle both.
    const sig = reason('low-surface-touches-significant') || reason('low-surface-touches-sensitive');
    if (sig) {
        statements.push({
            code: 'boundary-crossing',
            text: `Described as ${lane} work, it reaches into ${joinList(areaLabelsFor(sig.evidence))} — an operational boundary it never declares.`,
            evidence: sig.evidence,
        });
    }
    const edge = reason('import-edge-into-sensitive');
    if (edge) {
        const targets = uniqueSorted(result.blastRadius.importEdgeCrossings.map((e) => e.toTag));
        statements.push({
            code: 'new-operational-edge',
            text: `It opens a new operational edge into ${joinList(targets)} — a dependency the module did not previously have.`,
            evidence: edge.evidence,
        });
    }
    const central = reason('low-surface-touches-central-module');
    if (central) {
        const mod = profile && central.evidence.length > 0 ? (0, repo_topology_1.subsystemOf)(central.evidence[0], profile) : '';
        const fanIn = profile?.centralFanIn[mod];
        statements.push({
            code: 'centrality',
            text: `It touches \`${mod}\`, a high-centrality module ${typeof fanIn === 'number' ? `${fanIn} other module(s) depend on` : 'many modules depend on'} — changes here have broad operational reach.`,
            evidence: central.evidence,
        });
    }
    const docsrc = reason('docs-change-touches-source');
    if (docsrc) {
        statements.push({
            code: 'widening',
            text: `Declared as documentation, it widens into ${docsrc.evidence.length} runtime source file(s).`,
            evidence: docsrc.evidence,
        });
    }
    const gen = reason('generated-code-touched');
    if (gen) {
        statements.push({ code: 'generated-spillover', text: `It regenerates code outside a feature or chore — confirm the source-of-truth change accompanies it.`, evidence: gen.evidence });
    }
    const wide = reason('wide-blast-radius');
    if (wide) {
        const shown = wide.evidence.slice(0, 5);
        statements.push({
            code: 'widening',
            text: `Its blast radius spans ${wide.evidence.length} distinct ${profile ? 'modules' : 'subsystems'}: ${joinList(shown)}${wide.evidence.length > 5 ? ', …' : ''}.`,
            evidence: wide.evidence,
        });
    }
    // ── Summary: the single best "operational shape" sentence ───────────────────
    let summary;
    if (result.level === 'incoherent') {
        const areas = sig ? areaLabelsFor(sig.evidence) : uniqueSorted(result.blastRadius.importEdgeCrossings.map((e) => e.toTag));
        summary = `This ${lane} change crosses into ${joinList(areas)} — operational scope it does not declare.`;
    }
    else if (result.level === 'review') {
        if (central)
            summary = statements.find((s) => s.code === 'centrality').text;
        else if (docsrc)
            summary = `This documentation change widens into runtime source.`;
        else if (edge)
            summary = statements.find((s) => s.code === 'new-operational-edge').text;
        else if (wide)
            summary = `This ${lane} change spreads across ${wide.evidence.length} ${profile ? 'modules' : 'subsystems'} — wider than its label suggests.`;
        else if (gen)
            summary = `This ${lane} change modifies generated code.`;
        else
            summary = `This ${lane} change is worth a glance.`;
    }
    else if (result.mechanical?.isMechanical) {
        summary = `Recognised as a ${result.mechanical.mechanicalClass} change — a wide diff is expected, and operational scope checks were suppressed.`;
    }
    else if (codeModules.length === 1) {
        summary = `Changes stayed within the \`${codeModules[0]}\` module.`;
    }
    else {
        const areas = uniqueSorted(allFiles.map((f) => AREA_LABEL[operationalArea(f)]));
        summary = areas.length === 1
            ? `Changes stayed within ${areas[0]}.`
            : `Changes stayed within the expected operational boundary for ${lane} changes.`;
    }
    return { summary, statements: statements.slice(0, 3) };
}
//# sourceMappingURL=narrative.js.map