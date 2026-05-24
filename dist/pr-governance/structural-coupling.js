"use strict";
/**
 * Structural coupling: ownership topology + operational-vs-structural divergence
 * =============================================================================
 *
 * Cartography already reinforces co-change corridors with static dependency
 * edges (corridor.structural) and surfaces latent structural coupling. This
 * module adds the OWNERSHIP dimension — parsing CODEOWNERS deterministically —
 * and detects when operational coupling crosses ownership boundaries
 * ("operational widening crosses ownership despite clean structural
 * compartmentalisation").
 *
 * Pure, deterministic, sparse. No embeddings, no LLM, no scoring.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCodeowners = parseCodeowners;
exports.ownerOf = ownerOf;
exports.ownershipCrossings = ownershipCrossings;
exports.structuralStats = structuralStats;
/** Parse a CODEOWNERS file into ordered rules (later rules win, GitHub semantics). */
function parseCodeowners(content) {
    const rules = [];
    for (const raw of content.split('\n')) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line)
            continue;
        const parts = line.split(/\s+/);
        const glob = parts[0];
        const owners = parts.slice(1).filter((o) => o.startsWith('@') || o.includes('@'));
        if (glob && owners.length > 0)
            rules.push({ glob, owners });
    }
    return rules;
}
/** Owner(s) for a path — last matching rule wins (GitHub CODEOWNERS semantics). */
function ownerOf(path, rules) {
    let match = null;
    for (const rule of rules) {
        if (matchCodeownersGlob(path, rule.glob))
            match = rule.owners;
    }
    return match ? match.slice().sort().join(',') : null;
}
// Minimal CODEOWNERS glob: leading '/', '*' (single segment), '**'/dir-prefix.
function matchCodeownersGlob(path, glob) {
    const p = path.replace(/^\/+/, '');
    let g = glob.replace(/^\/+/, '');
    if (g === '*' || g === '**')
        return true;
    if (g.endsWith('/'))
        return p === g.slice(0, -1) || p.startsWith(g); // directory prefix
    if (!g.includes('*'))
        return p === g || p.startsWith(`${g}/`); // exact / dir
    const re = new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*')}(/.*)?$`);
    return re.test(p);
}
/** Co-change corridors whose two modules belong to different owners. */
function ownershipCrossings(map, rules) {
    if (rules.length === 0)
        return [];
    const out = [];
    for (const c of map.corridors) {
        const ownerA = ownerOf(`${c.a}/`, rules);
        const ownerB = ownerOf(`${c.b}/`, rules);
        if (ownerA && ownerB && ownerA !== ownerB)
            out.push({ a: c.a, b: c.b, ownerA, ownerB });
    }
    return out.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}
/** Sparse structural-coupling counts for a digest/report header. */
function structuralStats(map) {
    const reinforced = map.corridors.filter((c) => c.structural).length;
    return { reinforced, latent: map.latentStructural.length, total: map.corridors.length };
}
//# sourceMappingURL=structural-coupling.js.map