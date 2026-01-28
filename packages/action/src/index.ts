import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';

async function run(): Promise<void> {
  try {
    // 1. Get Inputs
    const apiKey = core.getInput('api_key') || core.getInput('api-key');
    const threshold = core.getInput('threshold') || 'C';
    const planId = core.getInput('plan_id') || core.getInput('plan-id');
    const record = core.getInput('record') === 'true';

    // 2. Install CLI
    try {
      await exec.exec('neurcode', ['--version'], { silent: true });
    } catch (e) {
      core.info('📦 @neurcode-ai/cli not found, installing...');
      await exec.exec('npm', ['install', '-g', '@neurcode-ai/cli@latest']);
    }

    await exec.exec('neurcode', ['--version']); // No silent: true — log installed version

    // 3. Construct Args
    const args = ['verify', '--json'];
    const pr = github.context.payload.pull_request;

    if (pr) {
      args.push('--base', `origin/${pr.base.ref}`);
    } else {
      args.push('--base', 'HEAD~1');
    }

    // Pass Plan ID if we have it (This forces the Pro Project)
    if (planId) args.push('--plan-id', planId);
    if (record) args.push('--record');

    // 4. Execute
    const env = {
      ...process.env,
      NEURCODE_API_KEY: apiKey,
      NEURCODE_THRESHOLD: threshold,
    };

    await exec.exec('neurcode', args, { env });
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
