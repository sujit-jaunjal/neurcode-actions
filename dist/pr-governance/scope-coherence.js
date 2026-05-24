"use strict";
/**
 * Deterministic PR Scope Coherence
 * ================================
 *
 * The OSS wedge. Answers one question, deterministically and with no LLM:
 *
 *   "Did this PR stay within a coherent operational boundary?"
 *
 * It compares the DECLARED scope of a PR (derived from its title, body,
 * labels, and linked-issue references) against the ACTUAL blast radius of the
 * diff (which subsystems the changed files belong to, plus newly-added
 * import edges that cross into sensitive boundaries).
 *
 * Design constraints (non-negotiable — this is the brand):
 *   - Pure functions over sorted inputs. Same PR ⇒ same verdict ⇒ same hash.
 *   - No embeddings, no vector DB, no probabilistic scoring, no network.
 *   - Conservative escalation: ⛔ incoherent is reserved for the one
 *     emotionally-unambiguous case (a low-surface change — docs/test/chore —
 *     that quietly modifies sensitive code). Everything else maxes out at
 *     ⚠️ review, and the default is ✅ coherent. This keeps signal high and
 *     false-positive blast-back low on real OSS repos.
 *
 * This module imports nothing from @actions/* so it stays trivially testable
 * and portable into the CLI runtime later.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyFile = classifyFile;
exports.deriveDeclaredScope = deriveDeclaredScope;
exports.parseImportEdgeCrossings = parseImportEdgeCrossings;
exports.deriveBlastRadius = deriveBlastRadius;
exports.assessScopeCoherence = assessScopeCoherence;
exports.evaluateScopeCoherence = evaluateScopeCoherence;
const node_crypto_1 = require("node:crypto");
const repo_topology_1 = require("./repo-topology");
const mechanical_signals_1 = require("./mechanical-signals");
const narrative_1 = require("./narrative");
// ── Subsystem taxonomy ────────────────────────────────────────────────────────
/**
 * High-signal, deliberately TIGHT sensitive-boundary tokens. Matched against
 * whole path tokens (split on /\._-) so "author" never matches "auth" and
 * "session"/"worker"/"token"/"net" are intentionally excluded — they are too
 * common in queue/transport codebases (Celery, Kombu) and would generate
 * exactly the false positives that erode maintainer trust.
 */
const SENSITIVE_TOKENS = {
    auth: 'auth',
    authn: 'auth',
    authz: 'authz',
    oauth: 'auth',
    sso: 'auth',
    saml: 'auth',
    credential: 'credentials',
    credentials: 'credentials',
    secret: 'secrets',
    secrets: 'secrets',
    security: 'security',
    crypto: 'crypto',
    cryptography: 'crypto',
    encryption: 'crypto',
    jwt: 'auth',
    rbac: 'permissions',
    permission: 'permissions',
    permissions: 'permissions',
    payment: 'payments',
    payments: 'payments',
    billing: 'billing',
    checkout: 'payments',
    scheduler: 'scheduler',
    executor: 'executor',
    runtime: 'runtime',
    kernel: 'kernel',
    migration: 'migrations',
    migrations: 'migrations',
};
/**
 * "Soft" sensitive tags are common as frontend folder names (an `Auth/` UI
 * component tree, a `permissions` settings page). They are downgraded to
 * frontend when the file is clearly a UI file — only the auth *runtime* should
 * trip the sensitive boundary, not the screen that configures it. Hard tags
 * (secrets, crypto, payments, scheduler, runtime, …) stay sensitive everywhere.
 */
const SOFT_SENSITIVE_TAGS = new Set(['auth', 'authz', 'permissions']);
const DOC_FILENAMES = new Set([
    'readme', 'changelog', 'contributing', 'license', 'notice', 'authors',
    'thanks', 'maintainers', 'codeowners', 'security', 'support', 'todo',
]);
const BUILD_FILENAMES = new Set([
    'package.json', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json',
    'pyproject.toml', 'setup.py', 'setup.cfg', 'pipfile', 'pipfile.lock',
    'poetry.lock', 'cargo.toml', 'cargo.lock', 'go.mod', 'go.sum',
    'build.gradle', 'pom.xml', 'makefile', 'tsconfig.json', 'webpack.config.js',
    'rollup.config.js', 'manifest.in',
]);
// 'mdc' = Cursor rule files; they are agent documentation, not load-bearing source.
const DOC_EXTS = new Set(['md', 'mdx', 'rst', 'adoc', 'mdc']);
const FRONTEND_EXTS = new Set(['tsx', 'jsx', 'vue', 'svelte', 'css', 'scss', 'less', 'html']);
const CONFIG_EXTS = new Set(['yml', 'yaml', 'json', 'toml', 'ini', 'cfg', 'properties']);
function normalizePath(p) {
    return (p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}
function tokensOf(path) {
    return path.toLowerCase().split(/[/\\._\-]+/).filter(Boolean);
}
function basename(path) {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
}
function extOf(path) {
    const base = basename(path);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}
/** Returns the sensitive tag for a path, or null. Token-exact to avoid substrings. */
function sensitiveTagFor(path) {
    for (const tok of tokensOf(path)) {
        if (SENSITIVE_TOKENS[tok])
            return SENSITIVE_TOKENS[tok];
    }
    return null;
}
/** Deterministic single-subsystem classification. First match wins. */
function classifyFile(rawPath) {
    const path = normalizePath(rawPath);
    const lower = path.toLowerCase();
    const segs = lower.split('/');
    const base = basename(lower);
    const ext = extOf(lower);
    const nameNoExt = base.includes('.') ? base.slice(0, base.indexOf('.')) : base;
    // 1. Generated code (strong signals only)
    if (segs.includes('generated') || segs.includes('__generated__') ||
        /(_pb2\.py|\.pb\.go|\.generated\.[a-z]+|\.g\.dart|\.designer\.cs)$/.test(base)) {
        return { subsystem: 'generated' };
    }
    // 2. CI
    if (lower.startsWith('.github/workflows/') || lower.startsWith('.circleci/') ||
        base === 'jenkinsfile' || base === '.travis.yml' || base === '.gitlab-ci.yml' ||
        base === 'azure-pipelines.yml') {
        return { subsystem: 'ci' };
    }
    // 3. Docs — and example/sample code, which accompanies docs rather than
    // being load-bearing source (e.g. Airflow's example_dags/).
    if (DOC_EXTS.has(ext) || segs.includes('docs') || segs.includes('doc') ||
        segs.includes('.cursor') ||
        segs.includes('examples') || segs.includes('example_dags') || segs.includes('samples') ||
        DOC_FILENAMES.has(nameNoExt) || (ext === 'txt' && segs.includes('docs'))) {
        return { subsystem: 'docs' };
    }
    // 4. Tests
    if (segs.includes('test') || segs.includes('tests') || segs.includes('__tests__') ||
        segs.includes('spec') || segs.includes('e2e') ||
        base === 'conftest.py' || /(^test_|_test\.|\.test\.|\.spec\.)/.test(base)) {
        return { subsystem: 'test' };
    }
    // 5. Build / dependency manifests
    if (BUILD_FILENAMES.has(base) || /^dockerfile/.test(base) || /^requirements.*\.txt$/.test(base) ||
        ext === 'gradle' || base === '.babelrc') {
        return { subsystem: 'build' };
    }
    // 5b. Security-TOOL artifacts. A `.secrets.baseline` (detect-secrets),
    // `.gitleaks.toml`, or `.trivyignore` names a security tool but is config, not
    // security CODE. Without this a routine baseline refresh reads as "touches secrets".
    if (base === '.secrets.baseline' || base.endsWith('.baseline') ||
        base === '.gitleaks.toml' || base === '.gitleaksignore' || base === '.trivyignore') {
        return { subsystem: 'config' };
    }
    // 6 / 7. Sensitive boundary vs frontend. A sensitive token in a UI file is
    // downgraded for the soft tags (auth/authz/permissions) — an `Auth/` component
    // tree is not the authentication runtime. Hard tags stay sensitive everywhere.
    const isFrontend = FRONTEND_EXTS.has(ext) || segs.includes('components') ||
        segs.includes('ui') || segs.includes('pages') || segs.includes('views');
    const tag = sensitiveTagFor(path);
    if (tag && !(isFrontend && SOFT_SENSITIVE_TAGS.has(tag))) {
        return { subsystem: 'sensitive', tag };
    }
    if (isFrontend) {
        return { subsystem: 'frontend' };
    }
    // 8. Config
    if (CONFIG_EXTS.has(ext) || base.startsWith('.env') || segs.includes('config')) {
        return { subsystem: 'config' };
    }
    // 9. First-party source (fallback)
    return { subsystem: 'source' };
}
// ── Declared-scope derivation ─────────────────────────────────────────────────
const CONVENTIONAL_KIND = {
    docs: 'docs', doc: 'docs',
    test: 'test', tests: 'test',
    chore: 'chore', build: 'chore', ci: 'chore', deps: 'chore', release: 'chore',
    fix: 'fix', bugfix: 'fix', hotfix: 'fix', patch: 'fix',
    refactor: 'refactor', perf: 'refactor', style: 'refactor',
    feat: 'feature', feature: 'feature',
};
const LABEL_KIND = [
    { match: /^(documentation|docs?)$/, kind: 'docs' },
    { match: /^(bug|bugfix|defect)$/, kind: 'fix' },
    { match: /^(enhancement|feature|feat)$/, kind: 'feature' },
    { match: /^(dependencies|deps|chore|build|ci)$/, kind: 'chore' },
    { match: /^(tests?|testing)$/, kind: 'test' },
    { match: /^(refactor|refactoring|cleanup)$/, kind: 'refactor' },
];
// Ordered keyword fallback. Lower-surface kinds first so an ambiguous title
// like "fix typo in docs" classifies as docs (the safer, higher-signal call).
// Boundaries are stricter than \b: a keyword must not be embedded in a
// hyphenated/underscored identifier, so branch names ("v3-2-test") and compound
// words ("publish-docs") do NOT mislabel a PR. Evidenced by apache/airflow#67233.
const KEYWORD_KIND = [
    { kind: 'docs', words: /(?<![\w-])(typo|readme|changelog|docs?|documentation|comments?|spelling|grammar|wording)(?![\w-])/ },
    { kind: 'test', words: /(?<![\w-])(tests?|specs?|coverage|flaky|fixtures?)(?![\w-])/ },
    { kind: 'chore', words: /(?<![\w-])(bump|upgrade|dependency|dependencies|lockfile|formatting|lint|linting|release|version)(?![\w-])/ },
    { kind: 'refactor', words: /(?<![\w-])(refactor|cleanup|rename|restructure|simplify|dedupe|deduplicate|tidy)(?![\w-])/ },
    { kind: 'fix', words: /(?<![\w-])(fix|fixes|fixed|bug|regression|hotfix|broken|crash|error|patch)(?![\w-])/ },
    { kind: 'feature', words: /(?<![\w-])(add|adds|implement|introduce|support|new|feature|enable)(?![\w-])/ },
];
function detectDeclaredSensitiveTags(text) {
    const found = new Set();
    const lower = ` ${text.toLowerCase()} `;
    for (const [token, tag] of Object.entries(SENSITIVE_TOKENS)) {
        const re = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, 'i');
        if (re.test(lower))
            found.add(tag);
    }
    return [...found].sort();
}
function parseLinkedIssues(body) {
    const nums = new Set();
    const re = /#(\d{1,7})\b/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0)
            nums.add(n);
    }
    return [...nums].sort((a, b) => a - b);
}
function deriveDeclaredScope(input) {
    const title = (input.title || '').trim();
    const body = (input.body || '').trim();
    const labels = (input.labels || []).map((l) => l.toLowerCase().trim()).filter(Boolean).sort();
    const haystack = `${title}\n${body}`;
    let changeKind = 'unknown';
    let changeKindSource = 'default';
    const conv = title.match(/^([a-z]+)(?:\([^)]*\))?!?:/i);
    if (conv && CONVENTIONAL_KIND[conv[1].toLowerCase()]) {
        changeKind = CONVENTIONAL_KIND[conv[1].toLowerCase()];
        changeKindSource = 'conventional-prefix';
    }
    if (changeKind === 'unknown') {
        for (const label of labels) {
            const hit = LABEL_KIND.find((l) => l.match.test(label));
            if (hit) {
                changeKind = hit.kind;
                changeKindSource = 'label';
                break;
            }
        }
    }
    if (changeKind === 'unknown') {
        const lowerTitle = title.toLowerCase();
        for (const k of KEYWORD_KIND) {
            if (k.words.test(lowerTitle)) {
                changeKind = k.kind;
                changeKindSource = 'keyword';
                break;
            }
        }
    }
    return {
        changeKind,
        changeKindSource,
        declaredSensitiveTags: detectDeclaredSensitiveTags(haystack),
        linkedIssues: parseLinkedIssues(body),
        title: title.length > 120 ? `${title.slice(0, 119)}…` : title,
    };
}
// ── Blast-radius derivation ───────────────────────────────────────────────────
/**
 * Parse a unified diff for ADDED import statements that cross into a sensitive
 * boundary. Conservative by construction: only first-party signals (relative
 * JS/TS imports, or dotted module paths whose segments name a sensitive token)
 * count, and only when the importing file is NOT itself sensitive.
 */
function parseImportEdgeCrossings(diffText) {
    if (!diffText)
        return [];
    const crossings = [];
    const seen = new Set();
    let currentFile = '';
    for (const line of diffText.split('\n')) {
        if (line.startsWith('+++ ')) {
            const m = line.match(/^\+\+\+ b\/(.+)$/);
            currentFile = m ? normalizePath(m[1]) : '';
            continue;
        }
        if (!line.startsWith('+') || line.startsWith('+++'))
            continue;
        if (!currentFile)
            continue;
        if (classifyFile(currentFile).subsystem === 'sensitive')
            continue; // sensitive→sensitive is expected
        const added = line.slice(1);
        const modules = [];
        // JS / TS
        const jsFrom = added.match(/\bfrom\s+['"]([^'"]+)['"]/);
        const jsReq = added.match(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/);
        const jsBare = added.match(/^\s*import\s+['"]([^'"]+)['"]/);
        if (jsFrom)
            modules.push(jsFrom[1]);
        if (jsReq)
            modules.push(jsReq[1]);
        if (jsBare)
            modules.push(jsBare[1]);
        // Python
        const pyFrom = added.match(/^\s*from\s+([.\w]+)\s+import\b/);
        const pyImport = added.match(/^\s*import\s+([.\w]+)/);
        if (pyFrom)
            modules.push(pyFrom[1]);
        if (pyImport && !jsBare)
            modules.push(pyImport[1]);
        for (const mod of modules) {
            const tag = sensitiveTagFor(mod);
            if (!tag)
                continue;
            const key = `${currentFile}|${mod}|${tag}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            crossings.push({ fromFile: currentFile, importedModule: mod, toTag: tag });
        }
    }
    return crossings.sort((a, b) => a.fromFile.localeCompare(b.fromFile) || a.importedModule.localeCompare(b.importedModule));
}
function deriveBlastRadius(changedFiles, diffText = '') {
    const files = [...new Set(changedFiles.map(normalizePath).filter(Boolean))].sort();
    const bySubsystem = new Map();
    for (const file of files) {
        const { subsystem, tag } = classifyFile(file);
        if (!bySubsystem.has(subsystem))
            bySubsystem.set(subsystem, { files: new Set(), tags: new Set() });
        const entry = bySubsystem.get(subsystem);
        entry.files.add(file);
        if (tag)
            entry.tags.add(tag);
    }
    const subsystems = [...bySubsystem.entries()]
        .map(([subsystem, v]) => ({
        subsystem,
        files: [...v.files].sort(),
        tags: [...v.tags].sort(),
    }))
        .sort((a, b) => a.subsystem.localeCompare(b.subsystem));
    const sensitiveTags = [...new Set(subsystems.flatMap((s) => s.tags))].sort();
    return {
        fileCount: files.length,
        subsystems,
        distinctSubsystemCount: subsystems.length,
        sensitiveTags,
        touchedGenerated: subsystems.some((s) => s.subsystem === 'generated'),
        importEdgeCrossings: parseImportEdgeCrossings(diffText),
    };
}
// ── Coherence assessment ──────────────────────────────────────────────────────
const LOW_SURFACE = new Set(['docs', 'test', 'chore']);
/**
 * A docs/test/chore PR is only "low-surface" while it stays small. A 100-file
 * release sync labelled `chore`/`test` is a bulk operation, not the small
 * innocuous change that hides a sensitive edit — flagging it is noise.
 * Evidenced by apache/airflow#67233. The headline case is always a few files.
 */
const LOW_SURFACE_MAX_FILES = 20;
/**
 * A docs PR editing a single source file is almost always a docstring/comment
 * fix — benign. Only flag when it edits several source files (a clearer "this
 * is actually code work mislabelled as docs" signal). Evidenced by the run:
 * apache/airflow#67101/#67114 (1-file docstring typos) were noise.
 */
const DOCS_SOURCE_MIN = 3;
/** First-party subsystems that count toward "blast radius spread". */
const SPREAD_SUBSYSTEMS = new Set(['source', 'sensitive', 'frontend', 'generated']);
const WIDE_SPREAD_THRESHOLD = 4;
function maxLevel(a, b) {
    const rank = { coherent: 0, review: 1, incoherent: 2 };
    return rank[a] >= rank[b] ? a : b;
}
function stableHash(declared, blast, level, mechanicalClass) {
    const shape = {
        kind: declared.changeKind,
        level,
        subs: blast.subsystems.map((s) => `${s.subsystem}:${s.files.length}:${s.tags.join('+')}`),
        sensitive: blast.sensitiveTags,
        edges: blast.importEdgeCrossings.map((e) => `${e.fromFile}->${e.toTag}`),
        generated: blast.touchedGenerated,
        mechanical: mechanicalClass ?? null,
    };
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 12);
}
function assessScopeCoherence(declared, blast, mechanical) {
    const reasons = [];
    let level = 'coherent';
    // Mechanical/bulk PRs (reverts, bumps, codemods…) are legitimately wide.
    // Suppress only the spread / generated / docs-source signals — never the
    // significance (Rule 1) or import-edge (Rule 2) signals.
    const mech = mechanical?.isMechanical === true;
    const sensitiveHit = blast.subsystems.find((s) => s.subsystem === 'sensitive');
    const undeclaredSensitiveTags = (sensitiveHit?.tags ?? [])
        .filter((tag) => !declared.declaredSensitiveTags.includes(tag));
    const sourceHit = blast.subsystems.find((s) => s.subsystem === 'source');
    const spread = blast.subsystems.filter((s) => SPREAD_SUBSYSTEMS.has(s.subsystem)).length;
    const isLowSurface = LOW_SURFACE.has(declared.changeKind) && blast.fileCount <= LOW_SURFACE_MAX_FILES;
    // RULE 1 — the headline. A small low-surface change quietly touching sensitive code.
    if (isLowSurface && undeclaredSensitiveTags.length > 0) {
        level = maxLevel(level, 'incoherent');
        reasons.push({
            code: 'low-surface-touches-sensitive',
            message: `A ${declared.changeKind} change modifies ${undeclaredSensitiveTags.join(', ')} code that the PR never mentions.`,
            evidence: sensitiveHit.files.filter((f) => undeclaredSensitiveTags.includes(classifyFile(f).tag || '')),
        });
    }
    // RULE 2 — import edge newly reaching into a sensitive boundary.
    const undeclaredEdges = blast.importEdgeCrossings.filter((e) => !declared.declaredSensitiveTags.includes(e.toTag));
    if (undeclaredEdges.length > 0) {
        level = maxLevel(level, isLowSurface ? 'incoherent' : 'review');
        reasons.push({
            code: 'import-edge-into-sensitive',
            message: `New import edge(s) reach into ${[...new Set(undeclaredEdges.map((e) => e.toTag))].sort().join(', ')}.`,
            evidence: undeclaredEdges.map((e) => `${e.fromFile} → ${e.importedModule}`),
        });
    }
    // RULE 3 — a docs change editing several real first-party source files.
    if (!mech && declared.changeKind === 'docs' && sourceHit && sourceHit.files.length >= DOCS_SOURCE_MIN
        && undeclaredSensitiveTags.length === 0) {
        level = maxLevel(level, 'review');
        reasons.push({
            code: 'docs-change-touches-source',
            message: `A docs change also edits ${sourceHit.files.length} source files.`,
            evidence: sourceHit.files,
        });
    }
    // RULE 4 — generated-code spillover in a DOCS/TEST change. Regen accompanying
    // a real code change (fix/feature/refactor/chore) is normal and not flagged.
    if (!mech && blast.touchedGenerated && (declared.changeKind === 'docs' || declared.changeKind === 'test')) {
        const gen = blast.subsystems.find((s) => s.subsystem === 'generated');
        level = maxLevel(level, 'review');
        reasons.push({
            code: 'generated-code-touched',
            message: `Generated code was modified in a ${declared.changeKind} change.`,
            evidence: gen.files,
        });
    }
    // RULE 5 — unusually wide blast radius for a non-feature change.
    if (!mech && spread >= WIDE_SPREAD_THRESHOLD &&
        (isLowSurface || declared.changeKind === 'fix' || declared.changeKind === 'unknown')) {
        level = maxLevel(level, 'review');
        reasons.push({
            code: 'wide-blast-radius',
            message: `Touches ${spread} distinct code subsystems — wide for a ${declared.changeKind} change.`,
            evidence: blast.subsystems.filter((s) => SPREAD_SUBSYSTEMS.has(s.subsystem)).map((s) => s.subsystem),
        });
    }
    let headline = buildHeadline(level, declared, blast, undeclaredSensitiveTags);
    if (level === 'coherent' && mech && mechanical) {
        headline = `Recognised as a ${mechanical.mechanicalClass} change — a wide diff is expected here.`;
    }
    return {
        level, declared, blastRadius: blast, reasons, headline,
        scopeHash: stableHash(declared, blast, level, mechanical?.mechanicalClass),
        ...(mech && mechanical ? { mechanical } : {}),
    };
}
function buildHeadline(level, declared, blast, undeclaredSensitiveTags) {
    const kind = declared.changeKind === 'unknown' ? 'unlabeled' : declared.changeKind;
    if (level === 'incoherent') {
        const tags = undeclaredSensitiveTags.length > 0 ? undeclaredSensitiveTags.join(', ') : blast.sensitiveTags.join(', ');
        return `This PR reads as a ${kind} change but modifies ${tags} code.`;
    }
    if (level === 'review') {
        const subs = blast.subsystems.filter((s) => SPREAD_SUBSYSTEMS.has(s.subsystem)).map((s) => s.subsystem);
        const list = subs.length > 0 ? subs.join(', ') : 'multiple areas';
        return `This ${kind} change spans ${list} — worth a glance to confirm it's intended.`;
    }
    return `Changes stay within the expected boundary for a ${kind} change.`;
}
/** Convenience: end-to-end from raw PR signals + changed files + diff. */
function evaluateScopeCoherence(input) {
    const declared = deriveDeclaredScope(input);
    const mechanical = input.disableMechanical
        ? undefined
        : (0, mechanical_signals_1.detectMechanical)({
            title: input.title,
            body: input.body,
            labels: input.labels,
            paths: input.changedFiles,
            fileStats: input.fileStats,
        });
    const result = input.topology
        ? assessWithTopology(declared, input.changedFiles, input.diffText || '', input.topology, mechanical)
        : assessScopeCoherence(declared, deriveBlastRadius(input.changedFiles, input.diffText), mechanical);
    // Narrative is a pure function of the deterministic result — replay-safe.
    return { ...result, narrative: (0, narrative_1.synthesizeNarrative)(result, input.topology) };
}
// ── Topology-aware assessment (repo-derived significance + module spread) ─────
// A parallel path to assessScopeCoherence, deliberately isolated so the
// validated default behaviour is untouched. Same conservative rule shape; the
// difference is WHERE "significant" and "spread" come from — the repo's own
// module topology rather than the hardcoded token taxonomy.
const TOPOLOGY_NONCODE_ROLES = new Set(['docs', 'test', 'ci', 'build', 'config', 'infra', 'generated']);
function assessWithTopology(declared, rawFiles, diffText, topology, mechanical) {
    const mech = mechanical?.isMechanical === true;
    const files = [...new Set(rawFiles.map(normalizePath).filter(Boolean))].sort();
    const byBucket = new Map();
    const addHit = (bucket, file, tag, significant) => {
        const e = byBucket.get(bucket) ?? { files: [], tags: new Set(), significant: false };
        e.files.push(file);
        if (tag)
            e.tags.add(tag);
        e.significant = e.significant || significant;
        byBucket.set(bucket, e);
    };
    const significantHits = [];
    const sourceFiles = [];
    const codeModules = new Set();
    let touchedGenerated = false;
    for (const f of files) {
        const role = (0, repo_topology_1.roleOf)(f);
        if (role === 'generated')
            touchedGenerated = true;
        if (TOPOLOGY_NONCODE_ROLES.has(role)) {
            addHit(role, f, undefined, false);
            continue;
        }
        const moduleId = (0, repo_topology_1.subsystemOf)(f, topology);
        codeModules.add(moduleId);
        if ((0, repo_topology_1.isSignificant)(f, topology)) {
            const tag = (0, repo_topology_1.significantSecurityTagFor)(f) || (role === 'entrypoint' ? 'entrypoint' : 'core');
            significantHits.push({ file: f, tag });
            addHit(moduleId, f, tag, true);
        }
        else {
            sourceFiles.push(f);
            addHit(moduleId, f, undefined, false);
        }
    }
    const subsystems = [...byBucket.entries()]
        .map(([subsystem, v]) => ({ subsystem, files: v.files.sort(), tags: [...v.tags].sort(), significant: v.significant }))
        .sort((a, b) => a.subsystem.localeCompare(b.subsystem));
    const blast = {
        fileCount: files.length,
        subsystems,
        distinctSubsystemCount: subsystems.length,
        sensitiveTags: [...new Set(significantHits.map((h) => h.tag))].sort(),
        touchedGenerated,
        importEdgeCrossings: parseImportEdgeCrossings(diffText),
    };
    const reasons = [];
    let level = 'coherent';
    const isLowSurface = LOW_SURFACE.has(declared.changeKind) && blast.fileCount <= LOW_SURFACE_MAX_FILES;
    // A named security area is "declared"; an entrypoint/central-core hit cannot be
    // named by a PR author, so it always counts as undeclared significance.
    const undeclaredSig = significantHits.filter((h) => (h.tag === 'entrypoint' || h.tag === 'core') ? true : !declared.declaredSensitiveTags.includes(h.tag));
    const undeclaredTags = [...new Set(undeclaredSig.map((h) => h.tag))].sort();
    // HARD significance (security boundary, runtime entrypoint) → incoherent.
    // SOFT significance (high-centrality 'core' module) → only review. Centrality
    // subtly raises attention; it never produces the dramatic ⛔ on its own.
    const hardHits = undeclaredSig.filter((h) => h.tag !== 'core');
    const softHits = undeclaredSig.filter((h) => h.tag === 'core');
    const hardTags = [...new Set(hardHits.map((h) => h.tag))].sort();
    // RULE 1 — small low-surface change touching a hard boundary it never names.
    if (isLowSurface && hardHits.length > 0) {
        level = maxLevel(level, 'incoherent');
        reasons.push({
            code: 'low-surface-touches-significant',
            message: `A ${declared.changeKind} change modifies operationally significant code (${hardTags.join(', ')}) the PR never mentions.`,
            evidence: hardHits.map((h) => h.file),
        });
    }
    // RULE 1b — central-module touch (import centrality): subtler, review-only.
    if (!mech && isLowSurface && softHits.length > 0 && hardHits.length === 0) {
        const centralMods = [...new Set(softHits.map((h) => (0, repo_topology_1.subsystemOf)(h.file, topology)))].sort();
        level = maxLevel(level, 'review');
        reasons.push({
            code: 'low-surface-touches-central-module',
            message: `A ${declared.changeKind} change touches high-centrality module(s) — ${centralMods.join(', ')} — that many other modules depend on.`,
            evidence: softHits.map((h) => h.file),
        });
    }
    // RULE 2 — new import edge into a security boundary.
    const undeclaredEdges = blast.importEdgeCrossings.filter((e) => !declared.declaredSensitiveTags.includes(e.toTag));
    if (undeclaredEdges.length > 0) {
        level = maxLevel(level, isLowSurface ? 'incoherent' : 'review');
        reasons.push({
            code: 'import-edge-into-sensitive',
            message: `New import edge(s) reach into ${[...new Set(undeclaredEdges.map((e) => e.toTag))].sort().join(', ')}.`,
            evidence: undeclaredEdges.map((e) => `${e.fromFile} → ${e.importedModule}`),
        });
    }
    // RULE 3 — docs change editing several ordinary source files.
    if (!mech && declared.changeKind === 'docs' && sourceFiles.length >= DOCS_SOURCE_MIN && undeclaredSig.length === 0) {
        level = maxLevel(level, 'review');
        reasons.push({
            code: 'docs-change-touches-source',
            message: `A docs change also edits ${sourceFiles.length} source files.`,
            evidence: sourceFiles,
        });
    }
    // RULE 4 — generated-code spillover in a DOCS/TEST change only (regen
    // accompanying a real code change is normal).
    if (!mech && touchedGenerated && (declared.changeKind === 'docs' || declared.changeKind === 'test')) {
        level = maxLevel(level, 'review');
        reasons.push({
            code: 'generated-code-touched',
            message: `Generated code was modified in a ${declared.changeKind} change.`,
            evidence: byBucket.get('generated')?.files ?? [],
        });
    }
    // RULE 5 — wide blast radius across the repo's OWN modules.
    if (!mech && codeModules.size >= WIDE_SPREAD_THRESHOLD &&
        (isLowSurface || declared.changeKind === 'fix' || declared.changeKind === 'unknown')) {
        level = maxLevel(level, 'review');
        reasons.push({
            code: 'wide-blast-radius',
            message: `Touches ${codeModules.size} distinct modules — wide for a ${declared.changeKind} change.`,
            evidence: [...codeModules].sort(),
        });
    }
    const kindLabel = declared.changeKind === 'unknown' ? 'unlabeled' : declared.changeKind;
    let headline;
    if (level === 'incoherent') {
        headline = `This PR reads as a ${kindLabel} change but modifies operationally significant code (${hardTags.join(', ')}).`;
    }
    else if (level === 'review') {
        headline = `This ${kindLabel} change spans ${codeModules.size} module(s) — worth a glance to confirm it's intended.`;
    }
    else if (mech && mechanical) {
        headline = `Recognised as a ${mechanical.mechanicalClass} change — a wide diff is expected here.`;
    }
    else {
        headline = `Changes stay within the expected boundary for a ${kindLabel} change.`;
    }
    const scopeHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({
        kind: declared.changeKind, level, sig: undeclaredTags,
        modules: [...codeModules].sort(), edges: blast.importEdgeCrossings.map((e) => e.toTag).sort(),
        generated: touchedGenerated, profile: topology.profileHash, mechanical: mechanical?.mechanicalClass ?? null,
    })).digest('hex').slice(0, 12);
    return {
        level, declared, blastRadius: blast, reasons, headline, scopeHash,
        ...(mech && mechanical ? { mechanical } : {}),
    };
}
//# sourceMappingURL=scope-coherence.js.map