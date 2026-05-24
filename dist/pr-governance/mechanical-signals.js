"use strict";
/**
 * Mechanical / bulk PR detection (deterministic)
 * ==============================================
 *
 * Some wide PRs are wide *by nature* and operationally uninteresting: reverts,
 * release syncs, dependency bumps, generated-file refreshes, formatting sweeps,
 * codemods, snapshot updates, CI migrations. A maintainer already knows a revert
 * or a `bump X from 1.2 to 1.3` touches a lot — flagging "wide blast radius" on
 * those is exactly the kind of noise that gets an Action uninstalled.
 *
 * This module recognises those classes from deterministic signals only — PR
 * title/body semantics, label, file composition (via the topology role), and
 * diff shape (edit symmetry from per-file +/- counts). No classifier, no
 * embeddings, no scoring.
 *
 * CRUCIAL: detecting "mechanical" only ever DOWNGRADES the spread / generated /
 * docs-touches-source signals. It never suppresses a genuinely suspicious
 * signal — a low-surface change reaching into a *significant* module, or a new
 * import edge into a security boundary, still fires. A revert is allowed to be
 * wide; it is not allowed to quietly add an `import ..auth`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectMechanical = detectMechanical;
const repo_topology_1 = require("./repo-topology");
const NON_MERGE_NOTE = '';
const SNAPSHOT_RE = /(^|\/)(__snapshots__\/|cassettes\/|.+\.snap$|.+\.ambr$|.+\.approved\.[a-z]+$|.+\.vcr\.ya?ml$)/i;
function editSymmetry(files) {
    const withStats = files.filter((f) => typeof f.additions === 'number' && typeof f.deletions === 'number');
    if (withStats.length === 0)
        return { symmetricRatio: 0, lowChurn: false, n: 0 };
    let symmetric = 0;
    const churns = [];
    for (const f of withStats) {
        const a = f.additions ?? 0;
        const d = f.deletions ?? 0;
        churns.push(a + d);
        // "Replace-shaped": both sides non-trivial and within 25% (or ±2) of each other.
        if (a > 0 && d > 0 && Math.abs(a - d) <= Math.max(2, 0.25 * Math.max(a, d)))
            symmetric += 1;
    }
    churns.sort((x, y) => x - y);
    const median = churns[Math.floor(churns.length / 2)] ?? 0;
    return { symmetricRatio: symmetric / withStats.length, lowChurn: median <= 15, n: withStats.length };
}
function mech(mechanicalClass, reason) {
    return { isMechanical: true, mechanicalClass, reason };
}
/**
 * Deterministic mechanical classification. Ordered most-specific first.
 * `paths` drives composition checks; `fileStats` (optional per-file +/- counts)
 * sharpens the formatting/codemod shape signal but is not required.
 */
function detectMechanical(input) {
    const title = (input.title || '').trim();
    const body = (input.body || '').trim();
    const labels = (input.labels || []).map((l) => l.toLowerCase().trim());
    const paths = input.paths.filter(Boolean);
    if (paths.length === 0)
        return { isMechanical: false, mechanicalClass: null, reason: NON_MERGE_NOTE };
    const roles = paths.map(repo_topology_1.roleOf);
    const everyRoleIn = (allowed) => roles.every((r) => allowed.has(r));
    const fileStats = input.fileStats ?? paths.map((p) => ({ path: p }));
    // 1. REVERT — explicit author intent; reverts are legitimately wide.
    if (/^revert[\s:"(]/i.test(title) || /this reverts commit [0-9a-f]{7,40}/i.test(body)) {
        return mech('revert', 'PR is a revert (a revert legitimately spans whatever it undoes)');
    }
    // 2. RELEASE / version sync.
    if (labels.includes('release') ||
        /\b(prepare\s+)?release\b/i.test(title) || /\brc\d+\b/i.test(title) || /\bversion bump\b/i.test(title) ||
        /^sync\b.*\b(stable|release|main|test)\b/i.test(title) || /\bmerge\b.*\brelease[-/]?\d/i.test(title)) {
        return mech('release', 'release / version-sync PR');
    }
    // 3. DEPENDENCY BUMP — only when the change is confined to manifests/lockfiles,
    //    or the title is an unambiguous bump. A "bump" that edits source is NOT clean.
    const allManifests = everyRoleIn(new Set(['build', 'config']));
    const bumpTitle = /^(chore(\(deps\))?:?\s*)?bump\b/i.test(title) ||
        /^chore\(deps\)/i.test(title) ||
        /\b(update|upgrade|bump)\b.*\b(dependency|dependencies|deps|lockfile|requirements)\b/i.test(title) ||
        labels.includes('dependencies');
    if (allManifests && (bumpTitle || paths.length > 0)) {
        return mech('dependency-bump', 'only dependency manifests / lockfiles changed');
    }
    // 4. SNAPSHOT refresh.
    if (paths.every((p) => SNAPSHOT_RE.test(p))) {
        return mech('snapshot-refresh', 'only snapshot / cassette / approval files changed');
    }
    // 5. GENERATED refresh — diff is overwhelmingly generated files.
    const genRatio = roles.filter((r) => r === 'generated').length / roles.length;
    if (genRatio >= 0.8) {
        return mech('generated-refresh', `${Math.round(genRatio * 100)}% of changed files are generated`);
    }
    // 6. CI / infra migration — confined to CI/infra/build/config surfaces.
    if (everyRoleIn(new Set(['ci', 'infra', 'build', 'config']))) {
        return mech('ci-migration', 'only CI / infra / build / config files changed');
    }
    // 7. FORMATTING — explicit intent, ideally corroborated by symmetric diff shape.
    const sym = editSymmetry(fileStats);
    const fmtTitle = /\b(format(ting)?|reformat|prettier|gofmt|rustfmt|black|isort|clang-format|autopep8|eslint|lint(ing)?|whitespace|cosmetic|style)\b/i.test(title);
    if (fmtTitle && (paths.length <= 2 || sym.symmetricRatio >= 0.6)) {
        return mech('formatting', sym.symmetricRatio >= 0.6 ? 'formatting/style PR (symmetric diff shape)' : 'formatting/style PR');
    }
    // 8. CODEMOD / mass rename — uniform, low-churn, symmetric edits across many files.
    const renameTitle = /\b(codemod|mass[- ]?(rename|update|migration)|rename\b|replace\b.*\bwith\b|migrate\b.*\bto\b)\b/i.test(title);
    if ((renameTitle && paths.length >= 5) || (paths.length >= 10 && sym.lowChurn && sym.symmetricRatio >= 0.6)) {
        return mech('codemod', renameTitle ? 'codemod / mass-rename (title)' : 'codemod shape (many files, uniform low-churn symmetric diff)');
    }
    return { isMechanical: false, mechanicalClass: null, reason: NON_MERGE_NOTE };
}
//# sourceMappingURL=mechanical-signals.js.map