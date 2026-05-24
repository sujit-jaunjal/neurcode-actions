"use strict";
/**
 * Day-Zero Replay Bootstrap (deterministic)
 * =========================================
 *
 * Every observability mode (report / digest / cartography / dynamics) reads the
 * append-only ledger. On first adoption that ledger is empty — so this module
 * RECONSTRUCTS the same operational records by replaying recent merged-PR
 * history. Because a record is a pure projection of a (deterministic) coherence
 * result, the bootstrapped ledger is byte-identical to one accumulated PR-by-PR
 * over months — only the timing differs. No history wait, no DB, no LLM.
 *
 * The pure builder here takes already-fetched PR data; the Action does the
 * (bounded) API fetch and calls it. Replay-safe by construction.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapRecords = bootstrapRecords;
const scope_coherence_1 = require("./scope-coherence");
const operational_memory_1 = require("./operational-memory");
/** Reconstruct operational records from replayed PR history (pure, deterministic). */
function bootstrapRecords(prs, topology) {
    return prs
        .filter((p) => Array.isArray(p.files) && p.files.length > 0)
        .map((p) => (0, operational_memory_1.recordFromResult)((0, scope_coherence_1.evaluateScopeCoherence)({
        title: p.title,
        body: p.body,
        labels: p.labels ?? [],
        changedFiles: p.files,
        topology,
    }), { pr: p.number, author: p.author ?? '', mergedAt: p.mergedAt }, topology))
        .sort((a, b) => a.pr - b.pr);
}
//# sourceMappingURL=operational-bootstrap.js.map