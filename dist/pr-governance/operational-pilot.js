"use strict";
/**
 * Pilot Trust & Survivability instrumentation (deterministic)
 * ===========================================================
 *
 * The architecture is complete; the open question is sociology — does a
 * maintainer keep trusting the Action after weeks of real usage? This derives
 * the answer from the operational ledger itself (no dashboards, no scoring, no
 * analytics theatre):
 *
 *   silent-rate     coherent PRs (no comment)        — is presence staying low?
 *   flag-rate       review + incoherent              — review-fatigue proxy
 *   FAIL-eligible   incoherent                       — does FAIL stay rare?
 *   mechanical      reverts/bumps/codemods suppressed — the calm work
 *   override-rate   incoherent records in the ledger  — merged WHILE incoherent
 *                                                       (a finding the maintainer
 *                                                        accepted/overrode)
 *   trend           recent vs prior flag-rate         — TRUST DECAY detection
 *
 * A ledger record is a MERGED PR, so an incoherent record means a maintainer
 * merged despite the ⛔ — the deterministic override/false-positive signal.
 * Rising flag-rate over the window = the system is getting noisier = trust at
 * risk. Pure over the ledger ⇒ replay-safe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.derivePilotMetrics = derivePilotMetrics;
exports.synthesizePilotReport = synthesizePilotReport;
const node_crypto_1 = require("node:crypto");
// Deterministic sociology thresholds.
const TREND_MIN_WINDOW = 24;
const TREND_DELTA = 0.08; // flag-rate move ≥8pp = a trend
const WATCH_FLAG_RATE = 0.12; // >12% of PRs flagged → fatigue risk
const ATRISK_FLAG_RATE = 0.25; // >25% flagged → review fatigue / noise
const ATRISK_INCOHERENT_RATE = 0.10;
const ATRISK_TREND_DELTA = 0.15; // flag-rate rising ≥15pp → decay
function rate(records, pred) {
    return records.length === 0 ? 0 : records.filter(pred).length / records.length;
}
function derivePilotMetrics(all, windowSize = 120) {
    const records = [...all].sort((a, b) => a.pr - b.pr).slice(-windowSize);
    const window = records.length;
    const isFlag = (r) => r.verdict !== 'coherent';
    const silentRate = rate(records, (r) => r.verdict === 'coherent');
    const reviewRate = rate(records, (r) => r.verdict === 'review');
    const incoherentRate = rate(records, (r) => r.verdict === 'incoherent');
    const flagRate = rate(records, isFlag);
    const mechanicalRate = rate(records, (r) => r.mechanical !== null);
    const overrideRate = incoherentRate;
    let flagTrend = 'n/a';
    let trendDelta = 0;
    if (window >= TREND_MIN_WINDOW) {
        const mid = Math.floor(window / 2);
        const prior = rate(records.slice(0, mid), isFlag);
        const recent = rate(records.slice(mid), isFlag);
        trendDelta = recent - prior;
        flagTrend = Math.abs(trendDelta) < TREND_DELTA ? 'stable' : trendDelta > 0 ? 'rising' : 'falling';
    }
    const reasons = [];
    let survivability = 'healthy';
    if (flagRate >= ATRISK_FLAG_RATE) {
        survivability = 'at-risk';
        reasons.push(`flag-rate ${pct(flagRate)} — review fatigue risk`);
    }
    else if (incoherentRate >= ATRISK_INCOHERENT_RATE) {
        survivability = 'at-risk';
        reasons.push(`FAIL-eligible ${pct(incoherentRate)} — ⛔ no longer rare`);
    }
    else if (flagTrend === 'rising' && trendDelta >= ATRISK_TREND_DELTA) {
        survivability = 'at-risk';
        reasons.push(`flag-rate rising sharply (+${pct(trendDelta)}) — trust decay`);
    }
    else if (flagRate >= WATCH_FLAG_RATE) {
        survivability = 'watch';
        reasons.push(`flag-rate ${pct(flagRate)} — watch for fatigue`);
    }
    else if (flagTrend === 'rising') {
        survivability = 'watch';
        reasons.push(`flag-rate creeping up (+${pct(trendDelta)})`);
    }
    return { window, silentRate, reviewRate, incoherentRate, flagRate, mechanicalRate, overrideRate, flagTrend, survivability, reasons };
}
function pct(x) { return `${Math.round(x * 100)}%`; }
function synthesizePilotReport(input) {
    const metrics = derivePilotMetrics(input.records, input.windowSize ?? 120);
    const pilotHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({
        repo: input.repo ?? null, window: metrics.window,
        s: Math.round(metrics.silentRate * 100), f: Math.round(metrics.flagRate * 100),
        i: Math.round(metrics.incoherentRate * 100), trend: metrics.flagTrend, surv: metrics.survivability,
    })).digest('hex').slice(0, 12);
    const trendWord = metrics.flagTrend === 'stable' ? 'holding'
        : metrics.flagTrend === 'falling' ? 'improving'
            : metrics.flagTrend === 'rising' ? 'rising — watch' : '';
    const lines = [
        '## Neurcode — Pilot Trust & Survivability',
        '',
        `_${input.repo ? `${input.repo} · ` : ''}window ${metrics.window} merged PRs · pilot \`${pilotHash}\`_`,
        '',
    ];
    if (metrics.window < 8) {
        lines.push('Not enough history yet for a trust profile (need ≥8 merged PRs).');
    }
    else {
        lines.push(`**Trust profile:** ${metrics.survivability}`, '');
        lines.push(`- Silence: ${pct(metrics.silentRate)} of merged PRs coherent — no comment${trendWord ? ` · presence ${trendWord}` : ''}.`);
        lines.push(`- Review-class: ${pct(metrics.reviewRate)} · FAIL-eligible (incoherent): ${pct(metrics.incoherentRate)}${metrics.incoherentRate < 0.05 ? ' — rare' : ''}.`);
        if (metrics.mechanicalRate > 0)
            lines.push(`- Mechanical PRs auto-suppressed: ${pct(metrics.mechanicalRate)} (reverts / bumps / codemods stayed quiet).`);
        if (metrics.overrideRate > 0)
            lines.push(`- Overrides (merged while incoherent): ${pct(metrics.overrideRate)}.`);
        if (metrics.reasons.length === 0)
            lines.push('- No trust-decay detected — flag-rate low and stable across the window.');
        else
            for (const r of metrics.reasons)
                lines.push(`- ⚠ ${r}.`);
    }
    lines.push('', '---', `Deterministic · ${metrics.window} ledger records · pilot \`${pilotHash}\``, '_Operational trust dynamics from the replay-safe ledger. Not analytics, not scoring._');
    return { metrics, pilotHash, markdown: lines.join('\n') };
}
//# sourceMappingURL=operational-pilot.js.map