"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCliCompatibilityPayload = parseCliCompatibilityPayload;
exports.parseApiHealthCompatibilityPayload = parseApiHealthCompatibilityPayload;
exports.validateActionHandshake = validateActionHandshake;
const contracts_1 = require("@neurcode-ai/contracts");
function asRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label}: expected object`);
    }
    return value;
}
function asString(record, key, label) {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${label}: expected ${key}:string`);
    }
    return value.trim();
}
function asOptionalString(record, key, label) {
    const value = record[key];
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${label}: expected optional ${key}:string`);
    }
    return value.trim();
}
function asRuntimeComponent(value, label) {
    if (value === 'cli' || value === 'action' || value === 'api') {
        return value;
    }
    throw new Error(`${label}: expected component "cli" | "action" | "api"`);
}
function parseMinimumPeerVersions(value, label) {
    if (value === undefined || value === null)
        return {};
    const record = asRecord(value, `${label}.minimumPeerVersions`);
    const next = {};
    for (const component of ['cli', 'action', 'api']) {
        const item = record[component];
        if (item === undefined)
            continue;
        if (typeof item !== 'string' || !item.trim()) {
            throw new Error(`${label}.minimumPeerVersions: expected ${component}:string`);
        }
        next[component] = item.trim();
    }
    return next;
}
function parseDescriptor(value, label) {
    const record = asRecord(value, label);
    return {
        contractId: asString(record, 'contractId', label),
        runtimeContractVersion: asString(record, 'runtimeContractVersion', label),
        cliJsonContractVersion: asString(record, 'cliJsonContractVersion', label),
        manifestVersion: asOptionalString(record, 'manifestVersion', label),
        component: asRuntimeComponent(asString(record, 'component', label), label),
        componentVersion: asString(record, 'componentVersion', label),
        minimumPeerVersions: parseMinimumPeerVersions(record.minimumPeerVersions, label),
    };
}
function parseCliCompatibilityPayload(value) {
    const parsed = (0, contracts_1.parseCliCompatJsonPayload)(value, 'action-cli-compat');
    if (parsed.success !== true) {
        throw new Error('action-cli-compat: success=false');
    }
    const descriptor = parseDescriptor(parsed.compatibility, 'action-cli-compat.compatibility');
    return {
        source: 'cli',
        ...descriptor,
    };
}
function parseApiHealthCompatibilityPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value;
    if (!record.compatibility) {
        return null;
    }
    const descriptor = parseDescriptor(record.compatibility, 'action-api-compat.compatibility');
    return {
        source: 'api',
        ...descriptor,
    };
}
function validateVersionMinimum(label, actual, required, errors) {
    if (!required)
        return;
    const isCompatible = (0, contracts_1.isSemverAtLeast)(actual, required);
    if (isCompatible === null) {
        errors.push(`${label}: unable to compare versions (actual=${actual}, required=${required}).`);
        return;
    }
    if (!isCompatible) {
        errors.push(`${label}: actual=${actual} is below required=${required}.`);
    }
}
function validateContractEnvelope(descriptor, expectedComponent, errors) {
    if (descriptor.component !== expectedComponent) {
        errors.push(`${descriptor.source} compatibility payload expected component=${expectedComponent} but received ${descriptor.component}.`);
    }
    if (descriptor.contractId !== contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_ID) {
        errors.push(`${descriptor.source} compatibility payload has unexpected contractId=${descriptor.contractId} (expected ${contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_ID}).`);
    }
    if (descriptor.runtimeContractVersion !== contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION) {
        errors.push(`${descriptor.source} compatibility payload has runtimeContractVersion=${descriptor.runtimeContractVersion} (expected ${contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION}).`);
    }
    if (descriptor.manifestVersion
        && descriptor.manifestVersion !== contracts_1.RUNTIME_COMPATIBILITY_MANIFEST_VERSION) {
        errors.push(`${descriptor.source} compatibility payload has manifestVersion=${descriptor.manifestVersion} (expected ${contracts_1.RUNTIME_COMPATIBILITY_MANIFEST_VERSION}).`);
    }
    if (descriptor.cliJsonContractVersion !== contracts_1.CLI_JSON_CONTRACT_VERSION) {
        errors.push(`${descriptor.source} compatibility payload has cliJsonContractVersion=${descriptor.cliJsonContractVersion} (expected ${contracts_1.CLI_JSON_CONTRACT_VERSION}).`);
    }
}
function validateActionHandshake(input) {
    const errors = [];
    const { actionVersion, cliCompatibility } = input;
    const apiCompatibility = input.apiCompatibility || null;
    const requireApiCompatibility = input.requireApiCompatibility === true;
    validateContractEnvelope(cliCompatibility, 'cli', errors);
    validateVersionMinimum('CLI version required by action', cliCompatibility.componentVersion, (0, contracts_1.getMinimumCompatiblePeerVersion)('action', 'cli'), errors);
    validateVersionMinimum('Action version required by CLI payload', actionVersion, cliCompatibility.minimumPeerVersions.action, errors);
    if (!apiCompatibility) {
        if (requireApiCompatibility) {
            errors.push('API compatibility payload missing while API compatibility handshake is required.');
        }
        return errors;
    }
    validateContractEnvelope(apiCompatibility, 'api', errors);
    validateVersionMinimum('API version required by action', apiCompatibility.componentVersion, (0, contracts_1.getMinimumCompatiblePeerVersion)('action', 'api'), errors);
    validateVersionMinimum('Action version required by API payload', actionVersion, apiCompatibility.minimumPeerVersions.action, errors);
    validateVersionMinimum('CLI version required by API payload', cliCompatibility.componentVersion, apiCompatibility.minimumPeerVersions.cli, errors);
    validateVersionMinimum('API version required by CLI payload', apiCompatibility.componentVersion, cliCompatibility.minimumPeerVersions.api, errors);
    return errors;
}
//# sourceMappingURL=runtime-compat.js.map