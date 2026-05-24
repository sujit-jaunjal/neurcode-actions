"use strict";
/**
 * Repository Operational Topology (deterministic, language-agnostic)
 * ==================================================================
 *
 * The current scope-coherence ontology classifies files against a hardcoded,
 * web-backend-shaped token list (auth/scheduler/payments/runtime/…). A replay
 * audit over real repos showed why that is insufficient: 25–80% of every repo's
 * code lands in an undifferentiated `source` bucket, and Rust/Dart/Go monorepos
 * (AppFlowy, CrewAI, Supabase) carry rich module structure the ontology never
 * sees.
 *
 * This module derives a repository's operational topology from the file tree
 * itself — no hardcoded ecosystem semantics, no LLM, no embeddings, no network.
 * The unit of structure is the **module**, defined the way each ecosystem
 * already defines it: a directory containing a package manifest (Cargo.toml,
 * pubspec.yaml, go.mod, package.json, pyproject.toml, …). Everything is a pure
 * function of a sorted path list, so the same tree yields the same profile and
 * the same `profileHash` — replay-stable by construction.
 *
 * What stays hardcoded (intentionally): a SMALL set of *universal* security
 * tokens (auth/crypto/secrets/payments/migrations). Those are genuinely
 * cross-language sensitive. What becomes derived: module boundaries, runtime
 * entrypoints, generated regions, and which modules are operationally
 * significant. The web-backend *architectural* tokens (scheduler/runtime/
 * executor/kernel) are deliberately dropped here — that role is now inferred
 * from entrypoints and (optionally) import centrality.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePath = normalizePath;
exports.securityTagFor = securityTagFor;
exports.significantSecurityTagFor = significantSecurityTagFor;
exports.roleOf = roleOf;
exports.deriveTopology = deriveTopology;
exports.subsystemOf = subsystemOf;
exports.isSignificant = isSignificant;
exports.withCentrality = withCentrality;
exports.findManifestPaths = findManifestPaths;
exports.deriveManifestEdges = deriveManifestEdges;
const node_crypto_1 = require("node:crypto");
// ── Universal security overlay (intentionally hardcoded, cross-language) ───────
// Token-exact match on path segments. Deliberately excludes architectural
// role words (scheduler/runtime/executor/kernel) — those are derived.
const SECURITY_TOKENS = {
    auth: 'auth', authn: 'auth', authz: 'authz', oauth: 'auth', sso: 'auth', saml: 'auth',
    credential: 'credentials', credentials: 'credentials',
    secret: 'secrets', secrets: 'secrets',
    security: 'security', crypto: 'crypto', cryptography: 'crypto', encryption: 'crypto', jwt: 'auth',
    rbac: 'permissions', permission: 'permissions', permissions: 'permissions',
    payment: 'payments', payments: 'payments', billing: 'billing', checkout: 'payments',
    migration: 'migrations', migrations: 'migrations',
};
// A directory is a "module root" if it directly contains one of these manifests.
const MANIFESTS = new Set([
    'package.json', 'cargo.toml', 'go.mod', 'pubspec.yaml',
    'pyproject.toml', 'setup.py', 'setup.cfg', 'pom.xml',
    'build.gradle', 'build.gradle.kts', 'composer.json', 'gemfile', 'mix.exs',
    'cmakelists.txt',
]);
// Monorepo container segments — when a manifest is absent, a child of one of
// these is still a recognisable module boundary.
const MONOREPO_CONTAINERS = new Set([
    'packages', 'apps', 'services', 'crates', 'libs', 'lib', 'modules', 'plugins', 'cmd', 'projects',
]);
const CODE_EXTS = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'dart',
    'java', 'kt', 'kts', 'rb', 'php', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'scala', 'swift', 'ex', 'exs',
]);
const DOC_EXTS = new Set(['md', 'mdx', 'rst', 'adoc', 'mdc']);
const CONFIG_EXTS = new Set(['yml', 'yaml', 'json', 'toml', 'ini', 'cfg', 'properties', 'env']);
// ── Path helpers (self-contained — no dependency on scope-coherence) ──────────
function normalizePath(p) {
    return (p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}
function dirOf(path) {
    const i = path.lastIndexOf('/');
    return i === -1 ? '' : path.slice(0, i);
}
function baseOf(path) {
    return path.split('/').pop() || path;
}
function extOf(path) {
    const b = baseOf(path);
    const d = b.lastIndexOf('.');
    return d > 0 ? b.slice(d + 1).toLowerCase() : '';
}
function segsOf(path) {
    return path.toLowerCase().split('/').filter(Boolean);
}
function tokensOf(path) {
    return path.toLowerCase().split(/[/\\._\-]+/).filter(Boolean);
}
/** Universal security tag for a path, or null. Token-exact (no "author"⊃"auth"). */
function securityTagFor(path) {
    for (const tok of tokensOf(path)) {
        if (SECURITY_TOKENS[tok])
            return SECURITY_TOKENS[tok];
    }
    return null;
}
const FRONTEND_EXTS_T = new Set(['tsx', 'jsx', 'vue', 'svelte', 'css', 'scss', 'less', 'html']);
const SOFT_SECURITY_TAGS = new Set(['auth', 'authz', 'permissions']);
function isFrontendPath(path) {
    const segs = segsOf(path);
    return FRONTEND_EXTS_T.has(extOf(path)) ||
        segs.includes('components') || segs.includes('ui') || segs.includes('pages') || segs.includes('views');
}
/**
 * Security tag for OPERATIONAL significance — like securityTagFor, but a soft
 * tag (auth/authz/permissions) in a frontend file is NOT significant: an
 * `Auth/` UI component tree is not the authentication runtime. Hard tags
 * (secrets/crypto/payments/migrations) stay significant everywhere. Evidenced
 * by supabase#46222 (a Modal→Dialog UI codemod under Auth/Policies/).
 */
function significantSecurityTagFor(rawPath) {
    const path = normalizePath(rawPath);
    const tag = securityTagFor(path);
    if (!tag)
        return null;
    if (SOFT_SECURITY_TAGS.has(tag) && isFrontendPath(path))
        return null;
    return tag;
}
// ── Structural role (path-based, language-agnostic, profile-independent) ──────
// Runtime entrypoints only. NOT lib.rs/mod.rs — a Rust library root is touched
// routinely and is not operationally critical the way a binary entrypoint is.
// (Real-PR evidence: AppFlowy#7996 over-fired on lib-log/src/lib.rs.)
const ENTRYPOINT_BASENAMES = new Set([
    'main.rs', 'main.go', 'main.py', '__main__.py', 'main.dart',
]);
// A main.* under a tooling/test/example path is a helper binary, NOT the
// product runtime entrypoint — it must not count as operationally significant.
// (Real-PR evidence: hashicorp/terraform#38606, a CI checker tool's main.go.)
// NB: 'cmd' is intentionally absent — Go product entrypoints live in cmd/ (e.g.
// cmd/terraform). A tooling binary lives under tools/hack/scripts/testdata.
const TOOLING_SEGS = new Set([
    'test', 'tests', 'testdata', 'example', 'examples', 'hack', 'tools', 'tool',
    'scripts', 'mocks', 'fixtures', 'e2e', 'bench', 'benchmarks', 'demo', 'demos',
]);
function isToolingPath(path) {
    return segsOf(path).some((s) => TOOLING_SEGS.has(s));
}
function roleOf(rawPath) {
    const path = normalizePath(rawPath);
    const lower = path.toLowerCase();
    const segs = segsOf(lower);
    const base = baseOf(lower);
    const ext = extOf(lower);
    const nameNoExt = base.includes('.') ? base.slice(0, base.indexOf('.')) : base;
    // Generated (strong, cross-language signals). Broadened for Go/k8s/proto/mocks
    // codegen so generated churn is recognised, not mistaken for source.
    if (segs.includes('generated') || segs.includes('__generated__') || segs.includes('openapi-gen') || segs.includes('mocks') ||
        base.startsWith('zz_generated') ||
        /(_pb2(_grpc)?\.py|\.pb\.(go|cc|h|dart)|\.g\.dart|\.freezed\.dart|\.gr\.dart|\.config\.dart|\.generated\.[a-z]+|\.designer\.cs|_generated\.go|\.gen\.go|_gen\.go|_swagger_doc_generated\.go)$/.test(base)) {
        return 'generated';
    }
    // CI
    if (lower.startsWith('.github/workflows/') || lower.startsWith('.circleci/') ||
        base === 'jenkinsfile' || base === '.travis.yml' || base === '.gitlab-ci.yml' || base === 'azure-pipelines.yml') {
        return 'ci';
    }
    // Infra surfaces
    if (segs.includes('terraform') || segs.includes('k8s') || segs.includes('kubernetes') ||
        segs.includes('helm') || segs.includes('charts') || segs.includes('ansible') ||
        segs.includes('deploy') || segs.includes('deployment') ||
        ext === 'tf' || /^dockerfile/.test(base) || /^docker-compose/.test(base)) {
        return 'infra';
    }
    // Docs (+ examples/cursor rules)
    if (DOC_EXTS.has(ext) || segs.includes('docs') || segs.includes('doc') || segs.includes('.cursor') ||
        segs.includes('examples') || segs.includes('example_dags') || segs.includes('samples') ||
        ['readme', 'changelog', 'contributing', 'license', 'notice', 'authors', 'thanks', 'maintainers', 'codeowners', 'support', 'todo'].includes(nameNoExt)) {
        return 'docs';
    }
    // Tests
    if (segs.includes('test') || segs.includes('tests') || segs.includes('__tests__') ||
        segs.includes('spec') || segs.includes('e2e') ||
        base === 'conftest.py' || /(^test_|_test\.|\.test\.|\.spec\.)/.test(base)) {
        return 'test';
    }
    // Build / dependency manifests
    if (MANIFESTS.has(base) || /^requirements.*\.txt$/.test(base) || base === 'makefile' ||
        base === 'tsconfig.json' || ext === 'lock' || base.endsWith('.lock')) {
        return 'build';
    }
    // Runtime entrypoints
    if (ENTRYPOINT_BASENAMES.has(base) || segs.includes('cmd') || segs.includes('bin')) {
        return 'entrypoint';
    }
    // Security-tool baselines are config, not security code
    if (base.endsWith('.baseline') || base === '.gitleaks.toml' || base === '.trivyignore') {
        return 'config';
    }
    // Config
    if (CONFIG_EXTS.has(ext) || base.startsWith('.env') || segs.includes('config')) {
        return 'config';
    }
    // First-party source
    return 'source';
}
// ── Topology derivation ───────────────────────────────────────────────────────
function deriveTopology(rawPaths) {
    const paths = [...new Set(rawPaths.map(normalizePath).filter(Boolean))].sort();
    // 1. Module roots = directories that hold a package manifest (excluding the
    //    repo root, which would swallow everything). Plus monorepo-container
    //    children that hold source, as a fallback for repos without nested manifests.
    const manifestDirs = new Set();
    for (const p of paths) {
        if (MANIFESTS.has(baseOf(p.toLowerCase()))) {
            const d = dirOf(p);
            if (d)
                manifestDirs.add(d);
        }
    }
    const containerChildren = new Set();
    for (const p of paths) {
        const segs = p.split('/');
        if (segs.length >= 3 && MONOREPO_CONTAINERS.has(segs[0].toLowerCase()) && CODE_EXTS.has(extOf(p))) {
            containerChildren.add(`${segs[0]}/${segs[1]}`);
        }
    }
    let moduleRoots = [...new Set([...manifestDirs, ...containerChildren])];
    // If we found essentially no structure, fall back to top-level directories
    // that contain code (so even a flat repo gets *some* partition).
    if (moduleRoots.length <= 1) {
        const topDirs = new Set();
        for (const p of paths) {
            const segs = p.split('/');
            if (segs.length >= 2 && CODE_EXTS.has(extOf(p)))
                topDirs.add(segs[0]);
        }
        moduleRoots = [...new Set([...moduleRoots, ...topDirs])];
    }
    // Longest-first so subsystemOf() matches the deepest (most specific) module.
    moduleRoots.sort((a, b) => b.length - a.length || a.localeCompare(b));
    // 2. Record which modules contain a runtime entrypoint — informational, for
    //    explanation only. Significance is FILE-level (see isSignificant), so a
    //    2000-file app is not "all significant" just because it has a main.*.
    const entrypointModules = new Set();
    for (const p of paths) {
        if (roleOf(p) === 'entrypoint') {
            const mod = matchModuleRoot(p, moduleRoots);
            if (mod)
                entrypointModules.add(mod);
        }
    }
    const profileHash = (0, node_crypto_1.createHash)('sha256')
        .update(JSON.stringify({ m: moduleRoots }))
        .digest('hex').slice(0, 12);
    return {
        moduleRoots,
        entrypointModules: [...entrypointModules].sort(),
        centralModules: [],
        centralFanIn: {},
        fileCount: paths.length,
        profileHash,
    };
}
function matchModuleRoot(path, moduleRoots) {
    const dir = dirOf(path);
    for (const root of moduleRoots) {
        if (dir === root || dir.startsWith(`${root}/`) || path.startsWith(`${root}/`))
            return root;
    }
    return null;
}
/** The repo-specific module a file belongs to (or its top-level dir as fallback). */
function subsystemOf(rawPath, profile) {
    const path = normalizePath(rawPath);
    const mod = matchModuleRoot(path, profile.moduleRoots);
    if (mod)
        return mod;
    const segs = path.split('/');
    return segs.length >= 2 ? segs[0] : '(root)';
}
/**
 * Operationally significant = a runtime entrypoint, a universal security zone,
 * a module flagged significant by derivation, or a centrality hotspot. This is
 * the generalized, repo-derived replacement for the hardcoded "sensitive" tag.
 */
function isSignificant(rawPath, profile) {
    const path = normalizePath(rawPath);
    if (roleOf(path) === 'entrypoint' && !isToolingPath(path))
        return true; // product entrypoint (not a tools/test/example binary)
    if (significantSecurityTagFor(path) !== null)
        return true; // file-level: universal security overlay (soft tags exempt in UI)
    const mod = matchModuleRoot(path, profile.moduleRoots); // module-level: only via import centrality
    return mod !== null && profile.centralModules.includes(mod);
}
/**
 * Layer fan-in centrality onto an existing profile. A module imported by many
 * distinct other modules is high-blast-radius. Threshold is the 90th-percentile
 * of fan-in (min 3), so "central" stays a small, high-signal set. Pure and
 * deterministic given the edge list; callers supply edges however they like.
 */
function withCentrality(profile, edges) {
    const fanIn = new Map();
    for (const e of edges) {
        if (e.fromModule === e.toModule)
            continue;
        if (!fanIn.has(e.toModule))
            fanIn.set(e.toModule, new Set());
        fanIn.get(e.toModule).add(e.fromModule);
    }
    const counts = [...fanIn.entries()].map(([m, s]) => ({ m, n: s.size })).sort((a, b) => b.n - a.n);
    if (counts.length === 0)
        return profile;
    const sorted = counts.map((c) => c.n).sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
    const threshold = Math.max(3, p90);
    const centralCounts = counts.filter((c) => c.n >= threshold);
    const central = centralCounts.map((c) => c.m).sort();
    const centralFanIn = {};
    for (const c of centralCounts)
        centralFanIn[c.m] = c.n;
    const profileHash = (0, node_crypto_1.createHash)('sha256')
        .update(JSON.stringify({ m: profile.moduleRoots, c: central }))
        .digest('hex').slice(0, 12);
    return { ...profile, centralModules: central, centralFanIn, profileHash };
}
/** Manifest file paths in a tree (so a caller knows the minimal set to read). */
function findManifestPaths(rawPaths) {
    return [...new Set(rawPaths.map(normalizePath).filter((p) => p && MANIFESTS.has(baseOf(p.toLowerCase()))))].sort();
}
function joinRelative(baseDir, rel) {
    const stack = baseDir.split('/').filter(Boolean);
    for (const seg of rel.replace(/\\/g, '/').split('/').filter(Boolean)) {
        if (seg === '.')
            continue;
        else if (seg === '..')
            stack.pop();
        else
            stack.push(seg);
    }
    return stack.join('/');
}
function deriveManifestEdges(manifests, moduleRoots) {
    const moduleOfDir = (dir) => {
        let best = null;
        for (const r of moduleRoots) {
            if ((dir === r || dir.startsWith(`${r}/`)) && (!best || r.length > best.length))
                best = r;
        }
        return best;
    };
    // package.json "name" → module index (for `workspace:` deps referenced by name).
    const nameToModule = new Map();
    for (const m of manifests) {
        if (baseOf(normalizePath(m.path).toLowerCase()) !== 'package.json')
            continue;
        try {
            const json = JSON.parse(m.content);
            const dir = dirOf(normalizePath(m.path));
            const mod = moduleOfDir(dir) ?? dir;
            if (typeof json.name === 'string' && mod)
                nameToModule.set(json.name, mod);
        }
        catch { /* tolerate malformed manifests */ }
    }
    // Module basename → module root (for Gradle `project(':foo:bar')` refs).
    const basenameToModule = new Map();
    for (const r of moduleRoots) {
        const b = r.split('/').pop();
        if (b && !basenameToModule.has(b))
            basenameToModule.set(b, r);
    }
    const edges = [];
    const seen = new Set();
    const add = (from, to) => {
        if (!from || !to || from === to)
            return;
        const key = `${from}->${to}`;
        if (seen.has(key))
            return;
        seen.add(key);
        edges.push({ fromModule: from, toModule: to });
    };
    for (const m of manifests) {
        const path = normalizePath(m.path);
        const base = baseOf(path.toLowerCase());
        const dir = dirOf(path);
        const fromModule = moduleOfDir(dir) ?? dir;
        if (base === 'cargo.toml' || base === 'pubspec.yaml' || base === 'go.mod') {
            // path = "../x"  ·  path: ../x  ·  => ../x   (relative, first-party only)
            const re = /(?:path\s*[=:]\s*["']?|=>\s*)(\.\.?\/[^\s"'),]+)/g;
            let mm;
            while ((mm = re.exec(m.content)) !== null)
                add(fromModule, moduleOfDir(joinRelative(dir, mm[1])));
        }
        else if (base === 'package.json') {
            try {
                const json = JSON.parse(m.content);
                const deps = { ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}), ...(json.peerDependencies ?? {}) };
                for (const [name, ver] of Object.entries(deps)) {
                    const v = String(ver);
                    if (/^(file:|link:)/.test(v))
                        add(fromModule, moduleOfDir(joinRelative(dir, v.replace(/^(file:|link:)/, ''))));
                    else if (/^workspace:/.test(v))
                        add(fromModule, nameToModule.get(name) ?? null);
                }
            }
            catch { /* tolerate malformed manifests */ }
        }
        else if (base === 'build.gradle' || base === 'build.gradle.kts') {
            // Gradle inter-module deps: project(':foo:bar') / project(path: ':foo')
            const re = /project\(\s*(?:path\s*[:=]\s*)?['"]:?([\w:.\-]+)['"]\s*\)/g;
            let mm;
            while ((mm = re.exec(m.content)) !== null) {
                const name = mm[1].split(':').filter(Boolean).pop();
                if (name)
                    add(fromModule, basenameToModule.get(name) ?? null);
            }
        }
        else if (base === 'cmakelists.txt') {
            // CMake: add_subdirectory(rel) declares a structural sub-module edge.
            const re = /add_subdirectory\(\s*([^\s)]+)/g;
            let mm;
            while ((mm = re.exec(m.content)) !== null) {
                const rel = mm[1].replace(/['"]/g, '');
                if (!rel.startsWith('${') && !rel.startsWith('/'))
                    add(fromModule, moduleOfDir(joinRelative(dir, rel)));
            }
        }
    }
    return edges.sort((a, b) => a.fromModule.localeCompare(b.fromModule) || a.toModule.localeCompare(b.toModule));
}
//# sourceMappingURL=repo-topology.js.map