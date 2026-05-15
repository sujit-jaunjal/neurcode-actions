"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMissingPlanVerificationFailure = isMissingPlanVerificationFailure;
exports.buildVerifyArgs = buildVerifyArgs;
exports.resolveEnterpriseEnforcement = resolveEnterpriseEnforcement;
exports.getVerifyFallbackDecision = getVerifyFallbackDecision;
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const MISSING_PLAN_VERIFY_PATTERNS = [
    'plan id is required in strict mode',
    'run "neurcode plan" first',
    'pass --plan-id',
    '"mode": "plan_required"',
    '"mode":"plan_required"',
    'missing plan context',
    'plan context missing',
    'no approved plan context',
];
function stripAnsi(value) {
    return value.replace(ANSI_PATTERN, '');
}
function isMissingPlanVerificationFailure(output) {
    const normalized = stripAnsi(output).toLowerCase();
    return MISSING_PLAN_VERIFY_PATTERNS.some((pattern) => normalized.includes(pattern));
}
function buildVerifyArgs(input) {
    const args = ['verify', '--json', '--base', input.baseRef];
    if (input.policyOnly) {
        args.push('--policy-only');
    }
    else if (input.planId) {
        args.push('--plan-id', input.planId);
    }
    if (input.projectId)
        args.push('--project-id', input.projectId);
    if (input.compiledPolicyPath) {
        args.push('--compiled-policy', input.compiledPolicyPath);
        // Skip policy lock baseline check when a compiled policy artifact is provided.
        // The compiled policy supersedes the lock file comparison; without this the lock
        // mismatch (fresh CI compile vs committed lock fingerprint) causes an early exit
        // before evaluateRules runs, preventing detection of actual policy violations.
        args.push('--skip-policy-lock');
    }
    if (input.changeContractPath)
        args.push('--change-contract', input.changeContractPath);
    if (input.enforceChangeContract)
        args.push('--enforce-change-contract');
    if (input.strictArtifacts)
        args.push('--strict-artifacts');
    if (input.requireSignedArtifacts)
        args.push('--require-signed-artifacts');
    if (input.requirePlan)
        args.push('--require-plan');
    if (input.requireRuntimeGuard)
        args.push('--require-runtime-guard');
    if (input.runtimeGuardPath)
        args.push('--runtime-guard', input.runtimeGuardPath);
    if (input.record)
        args.push('--record');
    if (input.evidence)
        args.push('--evidence');
    return args;
}
function resolveEnterpriseEnforcement(input) {
    const enforceChangeContract = typeof input.enforceChangeContract === 'boolean'
        ? input.enforceChangeContract
        : (input.enterpriseMode && !input.verifyPolicyOnly);
    const enforceStrictVerification = typeof input.enforceStrictVerification === 'boolean'
        ? input.enforceStrictVerification
        : input.enterpriseMode;
    const enforcePolicyExceptionWorkflow = typeof input.enforcePolicyExceptionWorkflow === 'boolean'
        ? input.enforcePolicyExceptionWorkflow
        : input.enterpriseMode;
    return {
        enforceChangeContract,
        enforceStrictVerification,
        enforcePolicyExceptionWorkflow,
    };
}
function getVerifyFallbackDecision(input) {
    if (input.verifyExitCode === 0) {
        return { shouldRetryPolicyOnly: false, reason: 'verify_succeeded' };
    }
    if (input.policyOnlyRequested) {
        return { shouldRetryPolicyOnly: false, reason: 'already_policy_only' };
    }
    if (input.allowFallbackPolicyOnly === false) {
        return { shouldRetryPolicyOnly: false, reason: 'strict_mode_no_fallback' };
    }
    if (input.hasExplicitPlanId) {
        return { shouldRetryPolicyOnly: false, reason: 'explicit_plan_id' };
    }
    if (isMissingPlanVerificationFailure(input.verifyOutput)) {
        return { shouldRetryPolicyOnly: true, reason: 'missing_plan_context' };
    }
    return { shouldRetryPolicyOnly: false, reason: 'not_missing_plan_failure' };
}
//# sourceMappingURL=verify-mode.js.map