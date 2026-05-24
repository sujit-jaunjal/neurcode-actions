"use strict";
/**
 * Release-aware operational intelligence (deterministic)
 * ======================================================
 *
 * Rolling windows capture continuous drift; software actually evolves in EPOCHS
 * — releases, migrations, architectural transitions. This layer groups the
 * longitudinal records by release boundary (git tag + date), snapshots each
 * release, and compares release-to-release to surface architectural transitions
 * and migration epochs.
 *
 * The narratives are release-ANCHORED FACTS, never causal claims. The system
 * states "v2.8: operational concentration rose 71% → 78%"; it does NOT guess
 * *why* (that would be prose). The maintainer knows what shipped in v2.8.
 *
 * Replay-safe: buckets are a pure grouping of (deterministic) records by a
 * release list, snapshots/transitions are pure folds, so the same (records,
 * releases) always yield the same report and the same reportHash.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPreRelease = isPreRelease;
exports.groupByReleases = groupByReleases;
exports.detectTransitions = detectTransitions;
exports.detectEpochs = detectEpochs;
exports.synthesizeReleaseReport = synthesizeReleaseReport;
const node_crypto_1 = require("node:crypto");
const operational_report_1 = require("./operational-report");
/**
 * Pre-release tags (alpha/beta/rc/dev/nightly) are not stable architectural
 * boundaries — they fragment the timeline into tiny, noisy windows. Excluded by
 * default; their PRs roll into the next stable release.
 */
function isPreRelease(tag) {
    return /(?:[-.]|^)(?:alpha|beta|rc|pre|preview|dev|snapshot|nightly|canary)\b/i.test(tag) ||
        /\d(?:a|b|rc|alpha|beta)\d+$/i.test(tag) ||
        /[-.](?:a|b|rc)\d+$/i.test(tag);
}
const MIN_RELEASE_PRS = 5;
const CONCENTRATION_SHIFT = 0.10;
const SIGNAL_SHIFT = 0.12;
const COUPLING_SHIFT = 0.15;
const EPOCH_RATE = 0.15;
// ── Grouping ──────────────────────────────────────────────────────────────────
/** Assign each record (by mergedAt) to the first release whose date is >= it. */
function groupByReleases(records, releases) {
    const sortedReleases = [...releases].filter((r) => r.tag && r.date).sort((a, b) => a.date.localeCompare(b.date));
    const dated = records.filter((r) => typeof r.mergedAt === 'string' && r.mergedAt);
    const byTag = new Map();
    for (const rel of sortedReleases)
        byTag.set(rel.tag, []);
    const unreleased = [];
    for (const rec of dated) {
        const m = rec.mergedAt;
        const rel = sortedReleases.find((r) => r.date >= m);
        if (rel)
            byTag.get(rel.tag).push(rec);
        else
            unreleased.push(rec);
    }
    const buckets = sortedReleases
        .map((rel) => ({ tag: rel.tag, date: rel.date, records: byTag.get(rel.tag).sort((a, b) => a.pr - b.pr) }))
        .filter((b) => b.records.length > 0)
        .map((b) => ({ ...b, snapshot: (0, operational_report_1.snapshotFromRecords)(b.records) }));
    if (unreleased.length > 0) {
        buckets.push({ tag: 'unreleased', date: '9999', records: unreleased.sort((a, b) => a.pr - b.pr), snapshot: (0, operational_report_1.snapshotFromRecords)(unreleased) });
    }
    return buckets;
}
function pct(x) { return `${Math.round(x * 100)}%`; }
function pairRates(records) {
    const counts = new Map();
    for (const r of records) {
        const areas = [...new Set(r.areas)].sort();
        for (let i = 0; i < areas.length; i++) {
            for (let j = i + 1; j < areas.length; j++)
                counts.set(`${areas[i]} + ${areas[j]}`, (counts.get(`${areas[i]} + ${areas[j]}`) ?? 0) + 1);
        }
    }
    const out = new Map();
    const n = Math.max(1, records.length);
    for (const [k, c] of counts)
        out.set(k, { rate: c / n, count: c });
    return out;
}
function detectTransitions(buckets) {
    const out = [];
    const real = buckets.filter((b) => b.tag !== 'unreleased');
    for (let i = 1; i < real.length; i++) {
        const cur = real[i];
        const prior = real[i - 1];
        if (cur.records.length < MIN_RELEASE_PRS || prior.records.length < MIN_RELEASE_PRS)
            continue;
        const cs = cur.snapshot;
        const ps = prior.snapshot;
        if (Math.abs(cs.concentrationTopShare - ps.concentrationTopShare) >= CONCENTRATION_SHIFT) {
            const rising = cs.concentrationTopShare > ps.concentrationTopShare;
            const top = cs.topModules[0]?.module;
            out.push({ tag: cur.tag, priorTag: prior.tag, kind: 'concentration-shift', architectural: true,
                text: `operational concentration ${rising ? 'rose' : 'fell'} ${pct(ps.concentrationTopShare)} → ${pct(cs.concentrationTopShare)}${top ? ` (top \`${top}\`)` : ''}` });
        }
        const curTop = cs.topModules[0]?.module;
        const priorTop = ps.topModules[0]?.module;
        if (curTop && priorTop && curTop !== priorTop && cs.hotspots.length > 0) {
            out.push({ tag: cur.tag, priorTag: prior.tag, kind: 'hotspot-shift', architectural: true,
                text: `the dominant module shifted from \`${priorTop}\` to \`${curTop}\`` });
        }
        const priorCentral = new Set(ps.centralModules);
        const curCentral = new Set(cs.centralModules);
        for (const m of cs.centralModules.filter((x) => !priorCentral.has(x))) {
            out.push({ tag: cur.tag, priorTag: prior.tag, kind: 'new-central', architectural: true, text: `\`${m}\` became operationally central` });
        }
        for (const m of ps.centralModules.filter((x) => !curCentral.has(x))) {
            out.push({ tag: cur.tag, priorTag: prior.tag, kind: 'lost-central', architectural: true, text: `\`${m}\` is no longer operationally central` });
        }
        if (Math.abs(cs.signals.widening - ps.signals.widening) >= SIGNAL_SHIFT) {
            const narrowed = cs.signals.widening < ps.signals.widening;
            out.push({ tag: cur.tag, priorTag: prior.tag, kind: 'widening-shift', architectural: false,
                text: `blast-radius widening ${narrowed ? 'narrowed' : 'widened'} ${pct(ps.signals.widening)} → ${pct(cs.signals.widening)}` });
        }
        if (Math.abs(cs.signals.generatedSpillover - ps.signals.generatedSpillover) >= SIGNAL_SHIFT) {
            const rising = cs.signals.generatedSpillover > ps.signals.generatedSpillover;
            out.push({ tag: cur.tag, priorTag: prior.tag, kind: 'spillover-shift', architectural: false,
                text: `generated-code spillover ${rising ? 'rose' : 'fell'} ${pct(ps.signals.generatedSpillover)} → ${pct(cs.signals.generatedSpillover)}` });
        }
        // Coupling: an area-pair that co-changes markedly more than the prior release.
        const curPairs = pairRates(cur.records);
        const priorPairs = pairRates(prior.records);
        const rising = [...curPairs.entries()]
            .filter(([k, v]) => v.count >= 2 && v.rate - (priorPairs.get(k)?.rate ?? 0) >= COUPLING_SHIFT)
            .sort((a, b) => b[1].rate - a[1].rate);
        if (rising.length > 0) {
            const [pairKey, v] = rising[0];
            out.push({ tag: cur.tag, priorTag: prior.tag, kind: 'coupling-shift', architectural: false,
                text: `${pairKey.replace(/-/g, ' ')} increasingly co-change (${pct(priorPairs.get(pairKey)?.rate ?? 0)} → ${pct(v.rate)} of PRs)` });
        }
    }
    return out;
}
function detectEpochs(buckets) {
    const real = buckets.filter((b) => b.tag !== 'unreleased' && b.records.length >= MIN_RELEASE_PRS);
    const epochs = [];
    for (const metric of ['generated-spillover', 'widening']) {
        const rateOf = (b) => metric === 'widening' ? b.snapshot.signals.widening : b.snapshot.signals.generatedSpillover;
        let runStart = -1;
        for (let i = 0; i <= real.length; i++) {
            const elevated = i < real.length && rateOf(real[i]) >= EPOCH_RATE;
            if (elevated && runStart === -1)
                runStart = i;
            else if (!elevated && runStart !== -1) {
                if (i - runStart >= 2)
                    epochs.push({ fromTag: real[runStart].tag, toTag: real[i - 1].tag, metric, releases: i - runStart });
                runStart = -1;
            }
        }
    }
    return epochs;
}
function synthesizeReleaseReport(input) {
    const releases = input.includePreReleases ? input.releases : input.releases.filter((r) => !isPreRelease(r.tag));
    const buckets = groupByReleases(input.records, releases);
    const transitions = detectTransitions(buckets);
    const epochs = detectEpochs(buckets);
    const transitionTags = new Set(transitions.filter((t) => t.architectural).map((t) => t.tag));
    const reportHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({
        repo: input.repo ?? null,
        buckets: buckets.map((b) => ({ tag: b.tag, w: b.records.length, c: Math.round(b.snapshot.concentrationTopShare * 100), top: b.snapshot.topModules[0]?.module ?? null })),
        transitions: transitions.map((t) => `${t.tag}:${t.kind}`),
        epochs: epochs.map((e) => `${e.fromTag}-${e.toTag}:${e.metric}`),
    })).digest('hex').slice(0, 12);
    const lines = [
        '## Neurcode — Release Operational History',
        '',
        `_${input.repo ? `${input.repo} · ` : ''}${buckets.length} release window(s) · report \`${reportHash}\`_`,
        '',
        '### Topology by release',
        '',
    ];
    // Newest first for readability.
    for (const b of [...buckets].reverse()) {
        const s = b.snapshot;
        const top = s.topModules[0]?.module;
        const marker = transitionTags.has(b.tag) ? '  ⟳ transition' : '';
        lines.push(`- **${b.tag}** (${b.records.length} PRs): concentration ${pct(s.concentrationTopShare)}${top ? ` · top \`${top}\`` : ''} · flagged ${pct(s.signals.flagged)}${marker}`);
    }
    lines.push('');
    lines.push('### Transitions', '');
    if (transitions.length === 0) {
        lines.push('- No architectural or operational transitions detected across these releases.');
    }
    else {
        for (const t of transitions)
            lines.push(`- **${t.priorTag} → ${t.tag}:** ${t.text}.`);
    }
    lines.push('');
    if (epochs.length > 0) {
        lines.push('### Migration epochs', '');
        for (const e of epochs) {
            lines.push(`- **${e.fromTag} → ${e.toTag}:** ${e.metric.replace(/-/g, ' ')} stayed elevated across ${e.releases} releases.`);
        }
        lines.push('');
    }
    lines.push('---', `Deterministic · ${input.records.filter((r) => r.mergedAt).length} dated records across ${buckets.length} releases · report \`${reportHash}\``, '_Release-anchored operational facts, derived from replay-safe topology primitives. Not causal claims._');
    return { repo: input.repo, buckets: buckets.length, transitions, epochs, reportHash, markdown: lines.join('\n') };
}
//# sourceMappingURL=release-memory.js.map