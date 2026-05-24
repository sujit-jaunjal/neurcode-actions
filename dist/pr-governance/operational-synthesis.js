"use strict";
/**
 * Operational Synthesis (deterministic fusion)
 * ============================================
 *
 * The platform now has many operational layers — drift, geography, momentum,
 * release transitions. Each is correct but FRAGMENTED. This layer fuses them
 * into ONE coherent, sparse operational digest.
 *
 * It is fusion, not summarisation: each statement is a deterministic
 * reconciliation of structured findings the other layers already produced. When
 * three layers point at the same fact (concentration rising + a pressure zone +
 * intensifying momentum, all on the same module) it emits ONE consolidated
 * sentence and lists which layers reinforced it. When a short-window drift and a
 * release-era momentum disagree, it says so plainly. When everything is quiet,
 * the digest is one calm line. Replay-safe: pure over the layer outputs, which
 * are pure over deterministic records.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizeOperationalDigest = synthesizeOperationalDigest;
const node_crypto_1 = require("node:crypto");
const operational_report_1 = require("./operational-report");
const operational_cartography_1 = require("./operational-cartography");
const operational_dynamics_1 = require("./operational-dynamics");
const DRIFT_THRESHOLD = 0.10;
function drift(cur, prior) {
    const d = cur - prior;
    if (Math.abs(d) < DRIFT_THRESHOLD)
        return 'stable';
    return d > 0 ? 'rising' : 'falling';
}
function areaOfModule(module, geo) {
    return geo.regions.find((r) => r.modules.includes(module))?.area;
}
function synthesizeOperationalDigest(input) {
    const cur = (0, operational_report_1.snapshotFromRecords)(input.current);
    const prior = input.prior && input.prior.length > 0 ? (0, operational_report_1.snapshotFromRecords)(input.prior) : undefined;
    const geo = (0, operational_cartography_1.deriveGeography)(input.current, input.staticEdges ?? []);
    const momentum = input.eras && input.eras.length >= 3 ? (0, operational_dynamics_1.deriveMomentum)(input.eras) : [];
    const mom = (kind, subject) => momentum.find((m) => m.kind === kind && (subject === undefined || m.subject === subject));
    const statements = [];
    const topModule = geo.pressureRegions[0]?.module ?? cur.topModules?.[0]?.module;
    // ── 1. Concentration / pressure: consolidation · migration · dispersal · stabilization
    const concMom = mom('concentration');
    const concDrift = prior ? drift(cur.concentrationTopShare, prior.concentrationTopShare) : undefined;
    const migrated = prior && geo.pressureRegions.length > 0 && cur.topModules[0] && prior.topModules[0]
        && cur.topModules[0].module !== prior.topModules[0].module
        && cur.topModules[0].share - (prior.topModules.find((m) => m.module === cur.topModules[0].module)?.share ?? 0) >= DRIFT_THRESHOLD;
    if (migrated && topModule) {
        const area = areaOfModule(topModule, geo);
        statements.push({ state: 'migrating', text: `Operational pressure has migrated toward \`${topModule}\`${area ? ` (the ${area} region)` : ''}.`, provenance: prov(['drift', concMom ? 'momentum' : null]) });
    }
    else if (topModule && (concDrift === 'rising' || concMom?.state === 'intensifying')) {
        // Reinforcement vs conflict between short-window drift and release-era momentum.
        if (concDrift === 'rising' && concMom?.state === 'cooling') {
            statements.push({ state: 'conflicting', text: `Operational concentration rose recently, but across release eras it is cooling — recent pressure may not persist.`, provenance: ['drift', 'momentum'] });
        }
        else {
            const area = areaOfModule(topModule, geo);
            statements.push({ state: 'consolidating', text: `Operational pressure is consolidating around \`${topModule}\`${area ? ` (the ${area} region)` : ''}.`, provenance: prov(['geography', concDrift === 'rising' ? 'drift' : null, concMom?.state === 'intensifying' ? 'momentum' : null]) });
        }
    }
    else if (concMom?.state === 'stabilized') {
        statements.push({ state: 'stabilizing', text: `Operational concentration has stabilized${concMom.sinceLabel ? ` after ${concMom.sinceLabel}` : ''} (around ${pct(cur.concentrationTopShare)}).`, provenance: ['momentum'] });
    }
    else if (concDrift === 'falling' || concMom?.state === 'cooling') {
        statements.push({ state: 'dispersing', text: `Operational pressure is dispersing — concentration is ${concMom?.state === 'cooling' ? 'cooling across release eras' : 'falling'}.`, provenance: prov([concDrift === 'falling' ? 'drift' : null, concMom?.state === 'cooling' ? 'momentum' : null]) });
    }
    // ── 2. Signals: widening + generated spillover (dissipation / intensification / containment)
    for (const [sig, label] of [['widening', 'Blast-radius widening'], ['generatedSpillover', 'Generated-code spillover']]) {
        const m = mom('signal', sig);
        const d = prior ? drift(cur.signals[sig], prior.signals[sig]) : undefined;
        if (m?.state === 'dissipated' || m?.state === 'cooling' || d === 'falling') {
            statements.push({ state: 'dispersing', text: `${label} has ${m?.state === 'dissipated' ? 'dissipated' : 'cooled'}.`, provenance: prov([d === 'falling' ? 'drift' : null, m ? 'momentum' : null]) });
        }
        else if (m?.state === 'intensifying' || d === 'rising') {
            statements.push({ state: 'consolidating', text: `${label} is intensifying.`, provenance: prov([d === 'rising' ? 'drift' : null, m ? 'momentum' : null]) });
        }
        else if (sig === 'generatedSpillover' && cur.signals.generatedSpillover > 0 && cur.signals.generatedSpillover < 0.1 && (m === undefined || m.state === 'persistent')) {
            statements.push({ state: 'contained', text: `Generated-code spillover stayed contained (${pct(cur.signals.generatedSpillover)}).`, provenance: ['drift'] });
        }
    }
    // ── 3. Corridors: co-evolution of regions (momentum-confirmed, else geography-present)
    const corridorMom = momentum.filter((m) => m.kind === 'corridor' && (m.state === 'intensifying' || m.state === 'persistent'));
    const corridorSubject = corridorMom[0]?.subject ?? (geo.corridors[0] ? `${geo.corridors[0].a} ${geo.corridors[0].b}` : undefined);
    if (corridorSubject) {
        const [a, b] = corridorSubject.split(' ');
        const aa = areaOfModule(a, geo);
        const ba = areaOfModule(b, geo);
        const regionClause = aa && ba && aa !== ba ? ` — ${aa} and ${ba} regions increasingly co-evolve` : '';
        const phrase = corridorMom[0]?.state === 'intensifying' ? 'continues to strengthen'
            : corridorMom[0]?.state === 'persistent' ? 'remains a sustained co-change path'
                : 'is an active co-change path';
        const structural = geo.corridors.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))?.structural === true;
        const reinforced = structural ? ' — reinforced by both replay evolution and static dependency topology' : '';
        statements.push({ state: 'co-evolving', text: `The \`${a}\` ↔ \`${b}\` corridor ${phrase}${regionClause}${reinforced}.`, provenance: prov([corridorMom[0] ? 'momentum' : null, 'geography', structural ? 'static' : null]) });
    }
    // Order by kineticness; cap.
    const rank = { migrating: 0, consolidating: 1, conflicting: 2, 'co-evolving': 3, dispersing: 4, stabilizing: 5, contained: 6 };
    const ordered = statements.sort((x, y) => rank[x.state] - rank[y.state]).slice(0, 6);
    const digestHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({
        repo: input.repo ?? null, window: cur.window, eras: input.eras?.length ?? 0,
        s: ordered.map((s) => `${s.state}:${s.text}`),
    })).digest('hex').slice(0, 12);
    return { window: cur.window, eras: input.eras?.length ?? 0, statements: ordered, digestHash, markdown: render(ordered, cur.window, input.eras?.length ?? 0, input.repo, digestHash) };
}
function pct(x) { return `${Math.round(x * 100)}%`; }
function prov(parts) { return parts.filter((p) => !!p); }
function render(statements, window, eras, repo, hash) {
    const lines = [
        '## Neurcode — Operational Digest',
        '',
        `_${repo ? `${repo} · ` : ''}window ${window} PRs${eras >= 3 ? ` · ${eras} release eras` : ''} · digest \`${hash}\`_`,
        '',
    ];
    if (statements.length === 0) {
        lines.push('Operationally quiet — no consolidation, migration, co-evolution, or dissipation above threshold across this window.');
    }
    else {
        for (const s of statements) {
            const reinforced = s.provenance.length >= 2 ? ` _(reinforced across ${s.provenance.join(' + ')})_` : '';
            lines.push(`- ${s.text}${reinforced}`);
        }
    }
    lines.push('', '---', `Deterministic synthesis of drift + geography + momentum · digest \`${hash}\``, '_One coherent operational picture, fused from replay-safe primitives. Not a summary._');
    return lines.join('\n');
}
//# sourceMappingURL=operational-synthesis.js.map