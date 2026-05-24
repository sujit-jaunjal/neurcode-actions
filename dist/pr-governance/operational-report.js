"use strict";
/**
 * Deterministic Operational Evolution Reports
 * ===========================================
 *
 * Longitudinal memory exposes per-PR records and intra-window trends. This layer
 * synthesises them into a calm, sparse, periodic REPORT that answers one
 * question: "how is this repository operationally evolving?"
 *
 * The report axis is current-window vs prior-window (real before/after), so it
 * can state genuine drift — "concentration rose from 80% to 85%", "widening
 * narrowed", or, just as importantly, "spillover remained stable". Unlike the
 * per-PR comment (which stays silent when nothing is wrong), a periodic report
 * is allowed to affirm stability — but every line is one factual, infrastructure-
 * native sentence. No KPIs, no scoring, no AI prose.
 *
 * Replay-safe: a snapshot is a pure reduction of (deterministic) records and the
 * report is a pure function of two snapshots, so the same windows always yield
 * the same report and the same `reportHash`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotFromRecords = snapshotFromRecords;
exports.synthesizeDriftReport = synthesizeDriftReport;
exports.renderReportMarkdown = renderReportMarkdown;
const node_crypto_1 = require("node:crypto");
const operational_memory_1 = require("./operational-memory");
const HOTSPOT_MIN_SHARE = 0.30;
const TOP_K = 3;
function snapshotFromRecords(records) {
    const n = records.length;
    const rate = (p) => (n === 0 ? 0 : records.filter(p).length / n);
    const touch = new Map();
    for (const r of records)
        for (const m of r.modules)
            touch.set(m, (touch.get(m) ?? 0) + 1);
    const totalTouches = [...touch.values()].reduce((a, b) => a + b, 0);
    const sortedMods = [...touch.entries()]
        .map(([module, c]) => ({ module, touches: c, share: n === 0 ? 0 : c / n }))
        .sort((a, b) => b.touches - a.touches || a.module.localeCompare(b.module));
    const areaCount = new Map();
    for (const r of records)
        for (const a of r.areas)
            areaCount.set(a, (areaCount.get(a) ?? 0) + 1);
    const areaShare = {};
    for (const [a, c] of [...areaCount.entries()].sort())
        areaShare[a] = n === 0 ? 0 : c / n;
    return {
        window: n,
        verdict: { coherent: rate((r) => r.verdict === 'coherent'), review: rate((r) => r.verdict === 'review'), incoherent: rate((r) => r.verdict === 'incoherent') },
        signals: {
            widening: rate((r) => r.codes.includes('widening')),
            boundaryCrossing: rate((r) => r.codes.includes('boundary-crossing')),
            generatedSpillover: rate((r) => r.codes.includes('generated-spillover')),
            newEdge: rate((r) => r.codes.includes('new-operational-edge')),
            flagged: rate((r) => r.verdict !== 'coherent'),
        },
        hotspots: sortedMods.filter((m) => m.share >= HOTSPOT_MIN_SHARE).map(({ module, share }) => ({ module, share })),
        topModules: sortedMods.slice(0, TOP_K).map(({ module, share }) => ({ module, share })),
        concentrationTopShare: totalTouches === 0 ? 0 : sortedMods.slice(0, TOP_K).reduce((a, m) => a + m.touches, 0) / totalTouches,
        centralModules: [...new Set(records.flatMap((r) => r.central))].sort(),
        areaShare,
    };
}
const RATE_THRESHOLD = 0.10; // signal-rate move ≥10pp to be drift
const CONCENTRATION_THRESHOLD = 0.05; // concentration move ≥5pp
function dir(cur, prior, thr) {
    const d = cur - prior;
    if (Math.abs(d) < thr)
        return 'stable';
    return d > 0 ? 'rising' : 'falling';
}
function pct(x) { return `${Math.round(x * 100)}%`; }
/** widening reads as widening/narrowing; other signals as rising/falling. */
function signalWord(metric, d) {
    if (d === 'stable')
        return 'stable';
    if (metric === 'widening')
        return d === 'rising' ? 'widening' : 'narrowing';
    return d;
}
function withPrior(label, cur, prior, thr, metric) {
    if (prior === undefined)
        return { code: metric, text: `${label}: ${pct(cur)}.` };
    const d = dir(cur, prior, thr);
    const word = signalWord(metric, d);
    const wasClause = Math.round(cur * 100) === Math.round(prior * 100) ? '' : ` (was ${pct(prior)})`;
    return { code: metric, text: `${label}: ${pct(cur)}${wasClause} — ${word}.` };
}
function synthesizeDriftReport(input) {
    const cur = snapshotFromRecords(input.current);
    const prior = input.prior && input.prior.length > 0 ? snapshotFromRecords(input.prior) : undefined;
    const periodLabel = input.periodLabel ?? `last ${cur.window} PRs${prior ? ` vs prior ${prior.window}` : ''}`;
    const sections = [];
    // Posture
    sections.push({
        heading: 'Posture',
        lines: [withPrior('Flagged (review + incoherent)', cur.signals.flagged, prior?.signals.flagged, RATE_THRESHOLD, 'flagged')],
    });
    // Operational signals — always render the three headline signals so the report
    // can calmly affirm stability; that is the report's job.
    sections.push({
        heading: 'Operational signals',
        lines: [
            withPrior('Blast-radius widening', cur.signals.widening, prior?.signals.widening, RATE_THRESHOLD, 'widening'),
            withPrior('Generated-code spillover', cur.signals.generatedSpillover, prior?.signals.generatedSpillover, RATE_THRESHOLD, 'generated-spillover'),
            withPrior('Undeclared boundary crossings', cur.signals.boundaryCrossing, prior?.signals.boundaryCrossing, RATE_THRESHOLD, 'boundary-crossing'),
        ],
    });
    // Concentration
    const concLines = [withPrior('Top-3 module concentration', cur.concentrationTopShare, prior?.concentrationTopShare, CONCENTRATION_THRESHOLD, 'concentration')];
    if (cur.topModules.length > 0) {
        concLines.push({ code: 'top-modules', text: `Top modules: ${cur.topModules.map((m) => `\`${m.module}\` (${pct(m.share)})`).join(', ')}.` });
    }
    sections.push({ heading: 'Concentration', lines: concLines });
    // Hotspots + emergence/cooling vs prior
    const hotspotLines = cur.hotspots.slice(0, 4).map((h) => ({ code: 'hotspot', text: `\`${h.module}\` — touched in ${pct(h.share)} of PRs.` }));
    if (prior) {
        const priorSet = new Set(prior.hotspots.map((h) => h.module));
        const curSet = new Set(cur.hotspots.map((h) => h.module));
        const emerged = cur.hotspots.filter((h) => !priorSet.has(h.module)).map((h) => h.module);
        const cooled = prior.hotspots.filter((h) => !curSet.has(h.module)).map((h) => h.module);
        if (emerged.length)
            hotspotLines.push({ code: 'hotspot-emerged', text: `New this period: ${emerged.map((m) => `\`${m}\``).join(', ')}.` });
        if (cooled.length)
            hotspotLines.push({ code: 'hotspot-cooled', text: `Cooled: ${cooled.map((m) => `\`${m}\``).join(', ')}.` });
    }
    if (hotspotLines.length > 0)
        sections.push({ heading: 'Hotspots', lines: hotspotLines });
    // Contributor operational spread (current window)
    const contributors = (0, operational_memory_1.deriveTimeline)(input.current, input.current.length).contributors;
    if (contributors.length > 0) {
        sections.push({
            heading: 'Contributor operational spread',
            lines: contributors.slice(0, 4).map((c) => ({
                code: 'contributor',
                text: `\`${c.author}\` — repeated ${c.code.replace(/-/g, ' ')} (${c.events} PRs)${c.areas.length ? ` in ${c.areas.slice(0, 3).join(', ')}` : ''}.`,
            })),
        });
    }
    const hashInput = JSON.stringify({ periodLabel, window: cur.window, priorWindow: prior?.window ?? null, sections, profile: input.repoProfileHash ?? null });
    const reportHash = (0, node_crypto_1.createHash)('sha256').update(hashInput).digest('hex').slice(0, 12);
    return { title: 'Operational Evolution Report', periodLabel, window: cur.window, priorWindow: prior?.window ?? null, sections, reportHash };
}
// ── Calm markdown rendering ───────────────────────────────────────────────────
function renderReportMarkdown(report, opts) {
    const lines = [
        '## Neurcode — Operational Evolution Report',
        '',
        `_${report.periodLabel}${opts?.repoProfileHash ? ` · repo profile \`${opts.repoProfileHash}\`` : ''} · report \`${report.reportHash}\`_`,
        '',
    ];
    for (const section of report.sections) {
        if (section.lines.length === 0)
            continue;
        lines.push(`### ${section.heading}`, '');
        for (const line of section.lines)
            lines.push(`- ${line.text}`);
        lines.push('');
    }
    lines.push('---', `Deterministic · derived from ${opts?.recordCount ?? report.window} operational records · report \`${report.reportHash}\``, '_Operational observability, not developer metrics. Derived from replay-safe topology primitives._');
    return lines.join('\n');
}
//# sourceMappingURL=operational-report.js.map