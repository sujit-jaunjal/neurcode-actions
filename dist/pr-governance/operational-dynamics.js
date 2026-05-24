"use strict";
/**
 * Operational Momentum & Stability Dynamics (deterministic)
 * =========================================================
 *
 * Prior layers answer "what is the operational shape now / how did it drift?".
 * This layer answers "how is it MOVING?" across a sequence of release eras —
 * is a pattern intensifying, cooling, stabilising, dissipating, or persistent?
 *
 * This is MOVEMENT ANALYSIS over observed history, NOT prediction. Every state
 * is a deterministic classification of a value series the engine already
 * produced. Requires ≥3 eras (2 = drift, already covered). Sparse: flat and
 * volatile series are suppressed. Replay-safe: pure over the era bundles, which
 * are pure over the deterministic records.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.eraFromRecords = eraFromRecords;
exports.classifyTrajectory = classifyTrajectory;
exports.deriveMomentum = deriveMomentum;
exports.synthesizeDynamicsReport = synthesizeDynamicsReport;
const node_crypto_1 = require("node:crypto");
const GENERIC_AREA = 'runtime-source';
function pairKey(a, b) { return a < b ? `${a} ${b}` : `${b} ${a}`; }
/** Build one era's metric bundle from its records (single deterministic pass). */
function eraFromRecords(label, records) {
    const n = records.length;
    const rate = (p) => (n === 0 ? 0 : records.filter(p).length / n);
    const touch = new Map();
    const coChange = new Map();
    const areaPair = new Map();
    for (const r of records) {
        const mods = [...new Set(r.modules)].sort();
        for (const m of mods)
            touch.set(m, (touch.get(m) ?? 0) + 1);
        for (let i = 0; i < mods.length; i++)
            for (let j = i + 1; j < mods.length; j++)
                coChange.set(pairKey(mods[i], mods[j]), (coChange.get(pairKey(mods[i], mods[j])) ?? 0) + 1);
        const sp = [...new Set(r.areas.filter((a) => a !== GENERIC_AREA))].sort();
        for (let i = 0; i < sp.length; i++)
            for (let j = i + 1; j < sp.length; j++)
                areaPair.set(pairKey(sp[i], sp[j]), (areaPair.get(pairKey(sp[i], sp[j])) ?? 0) + 1);
    }
    const totalTouches = [...touch.values()].reduce((a, b) => a + b, 0);
    const sortedMods = [...touch.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const concentration = totalTouches === 0 ? 0 : sortedMods.slice(0, 3).reduce((a, m) => a + m[1], 0) / totalTouches;
    const pressure = {};
    for (const [m, c] of touch)
        pressure[m] = n === 0 ? 0 : c / n;
    const corridors = {};
    for (const [k, c] of coChange)
        corridors[k] = n === 0 ? 0 : c / n;
    const boundaries = {};
    for (const [k, c] of areaPair)
        boundaries[k] = n === 0 ? 0 : c / n;
    return {
        label, window: n, concentration,
        signals: {
            widening: rate((r) => r.codes.includes('widening')),
            generatedSpillover: rate((r) => r.codes.includes('generated-spillover')),
            boundaryCrossing: rate((r) => r.codes.includes('boundary-crossing')),
            flagged: rate((r) => r.verdict !== 'coherent'),
        },
        pressure, corridors, boundaries,
        central: [...new Set(records.flatMap((r) => r.central))].sort(),
        topModule: sortedMods[0]?.[0] ?? null,
    };
}
const STEP_EPS = 0.03; // per-step noise floor (3pp)
const MIN_NET = 0.12; // net change to call intensifying/cooling (12pp)
const STABLE_RANGE = 0.05; // recent points within 5pp = stable
function classifyTrajectory(values) {
    const n = values.length;
    if (n < 3)
        return { state: 'flat' };
    const deltas = [];
    for (let i = 1; i < n; i++)
        deltas.push(values[i] - values[i - 1]);
    const net = values[n - 1] - values[0];
    const first = values[0];
    const last = values[n - 1];
    const peak = Math.max(...values);
    const range = peak - Math.min(...values);
    const rises = deltas.filter((d) => d > STEP_EPS).length;
    const falls = deltas.filter((d) => d < -STEP_EPS).length;
    // Trailing flat run: how many of the most recent steps are within the noise
    // floor. ≥2 small steps = the series has levelled off ("plateau").
    let trailingFlat = 0;
    for (let i = deltas.length - 1; i >= 0; i--) {
        if (Math.abs(deltas[i]) <= STEP_EPS)
            trailingFlat += 1;
        else
            break;
    }
    const recentPlateau = trailingFlat >= 2;
    // Plateau cases take precedence — distinguishes "rose then settled" from
    // "still rising", which a net-only test cannot.
    if (recentPlateau && range > STABLE_RANGE) {
        if (peak - last >= MIN_NET && last <= first + STEP_EPS)
            return { state: 'dissipated' };
        if (Math.abs(last - first) >= MIN_NET)
            return { state: 'stabilized', sinceIndex: n - 1 - trailingFlat };
        return { state: 'flat' };
    }
    // Active trend.
    if (net >= MIN_NET && rises >= falls)
        return { state: 'intensifying' };
    if (net <= -MIN_NET && falls >= rises)
        return { state: 'cooling' };
    if (rises > 0 && falls > 0 && Math.abs(net) < MIN_NET && range > STABLE_RANGE * 2)
        return { state: 'volatile' };
    return { state: 'flat' };
}
const SIGNAL_LABEL = {
    widening: 'blast-radius widening',
    generatedSpillover: 'generated-code spillover',
    boundaryCrossing: 'undeclared boundary crossings',
    flagged: 'flagged-PR rate',
};
const PROMINENCE = { corridor: 0.10, boundary: 0.10, pressure: 0.30 };
function pct(x) { return `${Math.round(x * 100)}%`; }
function path(series) { return series.map(pct).join(' → '); }
function subjectsAboveProminence(eras, pick, min) {
    const max = new Map();
    for (const e of eras)
        for (const [k, v] of Object.entries(pick(e)))
            max.set(k, Math.max(max.get(k) ?? 0, v));
    return [...max.entries()].filter(([, v]) => v >= min).map(([k]) => k).sort();
}
function deriveMomentum(eras) {
    if (eras.length < 3)
        return [];
    const out = [];
    const n = eras.length;
    const emit = (subject, kind, series, labelFor) => {
        const t = classifyTrajectory(series);
        const presentAll = series.every((v) => v > 0);
        const persistent = presentAll && (t.state === 'flat' || t.state === 'stabilized');
        // A present-in-every-era flat series is "persistent", not nothing.
        const state = persistent && t.state === 'flat' ? 'persistent' : t.state;
        if (state === 'flat')
            return; // suppress noise
        if (state === 'volatile')
            return; // suppress oscillation
        const sinceLabel = t.sinceIndex !== undefined ? eras[t.sinceIndex].label : undefined;
        out.push({ subject, kind, state, series, persistent, sinceLabel, text: phrase(subject, kind, labelFor, state, series, sinceLabel, persistent, n) });
    };
    emit('concentration', 'concentration', eras.map((e) => e.concentration), 'operational concentration');
    for (const sig of ['widening', 'generatedSpillover', 'boundaryCrossing', 'flagged']) {
        emit(sig, 'signal', eras.map((e) => e.signals[sig]), SIGNAL_LABEL[sig]);
    }
    for (const b of subjectsAboveProminence(eras, (e) => e.boundaries, PROMINENCE.boundary)) {
        emit(b, 'boundary', eras.map((e) => e.boundaries[b] ?? 0), `the ${b.replace(' ', ' ↔ ')} boundary`);
    }
    for (const c of subjectsAboveProminence(eras, (e) => e.corridors, PROMINENCE.corridor)) {
        emit(c, 'corridor', eras.map((e) => e.corridors[c] ?? 0), `the \`${c.split(' ').join('` ↔ `')}\` corridor`);
    }
    for (const p of subjectsAboveProminence(eras, (e) => e.pressure, PROMINENCE.pressure)) {
        emit(p, 'pressure', eras.map((e) => e.pressure[p] ?? 0), `pressure on \`${p}\``);
    }
    // Order: intensifying/cooling first (most kinetic), then stabilized/dissipated/persistent.
    const rank = { intensifying: 0, cooling: 1, dissipated: 2, stabilized: 3, persistent: 4, volatile: 5, flat: 6 };
    return out.sort((a, b) => rank[a.state] - rank[b.state] || a.kind.localeCompare(b.kind) || a.subject.localeCompare(b.subject));
}
function phrase(_subject, _kind, label, state, series, sinceLabel, persistent, eraCount) {
    const cap = label.charAt(0).toUpperCase() + label.slice(1);
    switch (state) {
        case 'intensifying': return `${cap} has risen across ${eraCount} release eras (${path(series)}).`;
        case 'cooling': return `${cap} momentum cooled across ${eraCount} release eras (${path(series)}).`;
        case 'stabilized': return `${cap} stabilized${sinceLabel ? ` after ${sinceLabel}` : ''} (around ${pct(series[series.length - 1])}).`;
        case 'dissipated': return `${cap} dissipated (peaked ${pct(Math.max(...series))}, now ${pct(series[series.length - 1])}).`;
        case 'persistent': return `${cap} has persisted across ${eraCount} release eras (around ${pct(series[series.length - 1])}).`;
        default: return `${cap}: ${path(series)}.`;
    }
}
function synthesizeDynamicsReport(input) {
    const findings = deriveMomentum(input.eras);
    const momentumHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({
        repo: input.repo ?? null,
        eras: input.eras.map((e) => e.label),
        findings: findings.map((f) => `${f.kind}:${f.subject}:${f.state}`),
    })).digest('hex').slice(0, 12);
    const lines = [
        '## Neurcode — Operational Dynamics',
        '',
        `_${input.repo ? `${input.repo} · ` : ''}${input.eras.length} release eras (${input.eras.map((e) => e.label).join(' → ')}) · momentum \`${momentumHash}\`_`,
        '',
    ];
    if (input.eras.length < 3) {
        lines.push('Not enough release history for momentum analysis (need ≥3 eras).');
    }
    else if (findings.length === 0) {
        lines.push('Operationally steady — no sustained momentum, cooling, or stabilization above threshold across these eras.');
    }
    else {
        const kinetic = findings.filter((f) => f.state === 'intensifying' || f.state === 'cooling' || f.state === 'dissipated');
        const settled = findings.filter((f) => f.state === 'stabilized' || f.state === 'persistent');
        if (kinetic.length > 0) {
            lines.push('### Movement', '');
            for (const f of kinetic.slice(0, 6))
                lines.push(`- ${f.text}`);
            lines.push('');
        }
        if (settled.length > 0) {
            lines.push('### Settled', '');
            for (const f of settled.slice(0, 6))
                lines.push(`- ${f.text}`);
            lines.push('');
        }
    }
    lines.push('---', `Deterministic movement analysis across ${input.eras.length} eras · momentum \`${momentumHash}\``, '_Observed-history momentum from replay-safe primitives. Not a forecast._');
    return { eras: input.eras.length, findings, momentumHash, markdown: lines.join('\n') };
}
//# sourceMappingURL=operational-dynamics.js.map