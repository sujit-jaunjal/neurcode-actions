"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDriftScore = calculateDriftScore;
function clampScore(value) {
    if (!Number.isFinite(value))
        return 0;
    if (value < 0)
        return 0;
    if (value > 100)
        return 100;
    return value;
}
function calculateDriftScore(data) {
    const scopeScore = Math.min(data.scopeIssues.length * 10, 100);
    const violationScore = Math.min(data.violations.length * 15, 100);
    const warningScore = Math.min(data.warnings.length * 5, 100);
    const weighted = (0.4 * scopeScore) + (0.4 * violationScore) + (0.2 * warningScore);
    const hasCriticalOrHighViolation = data.violations.some((violation) => {
        const severity = (violation.severity || '').trim().toLowerCase();
        return severity === 'critical' || severity === 'high';
    });
    const baseScore = Math.round(clampScore(weighted));
    return hasCriticalOrHighViolation ? Math.max(baseScore, 60) : baseScore;
}
//# sourceMappingURL=drift.js.map