"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPullRequestNumberFromContext = getPullRequestNumberFromContext;
exports.upsertGovernanceReportComment = upsertGovernanceReportComment;
const github = __importStar(require("@actions/github"));
const formatter_1 = require("./formatter");
function getPullRequestNumberFromContext() {
    const pullRequest = github.context.payload.pull_request;
    if (!pullRequest || typeof pullRequest.number !== 'number') {
        return null;
    }
    return pullRequest.number;
}
async function upsertGovernanceReportComment(input) {
    const prNumber = typeof input.prNumber === 'number'
        ? input.prNumber
        : getPullRequestNumberFromContext();
    if (!prNumber) {
        return;
    }
    const octokit = github.getOctokit(input.token);
    const finalBody = input.body.replaceAll(formatter_1.NEURCODE_RUN_ID_PLACEHOLDER, String(input.runId ?? github.context.runId));
    const { owner, repo } = github.context.repo;
    const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
    });
    const existing = comments.find((comment) => comment.body?.includes(formatter_1.NEURCODE_GOVERNANCE_REPORT_MARKER));
    if (existing) {
        await octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: existing.id,
            body: finalBody,
        });
        return;
    }
    await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: finalBody,
    });
}
//# sourceMappingURL=github-client.js.map