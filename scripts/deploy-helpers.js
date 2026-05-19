/**
 * Deploy helpers — R2 upload, deploy log, formatting.
 * @module scripts/deploy-helpers
 */

import { execSync } from 'child_process';
import { statSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DEPLOY_LOG = resolve(import.meta.dirname, '../.deploy-manifest.json');
const MAX_WRANGLER_SIZE = 300 * 1024 * 1024;
const R2_ENDPOINT =
  process.env.R2_ENDPOINT || `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;

/**
 *
 */
export function loadDeployLog() {
  if (existsSync(DEPLOY_LOG)) return JSON.parse(readFileSync(DEPLOY_LOG, 'utf-8'));
  return {};
}

/**
 *
 */
export function saveDeployLog(log) {
  writeFileSync(DEPLOY_LOG, JSON.stringify(log, null, 2));
}

/**
 *
 */
export function fmtSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** @param {string} localPath @param {string} remotePath @param {object} state @param {string} bucket @param {boolean} force @param {string|null} contentType */
export function upload(localPath, remotePath, state, bucket, force, contentType = null) {
  const localSize = statSync(localPath).size;
  const localMtime = statSync(localPath).mtimeMs;

  if (
    !force &&
    state.deployed[remotePath] &&
    state.deployed[remotePath].size === localSize &&
    state.deployed[remotePath].mtime === localMtime
  ) {
    state.skipCount++;
    return;
  }

  if (localSize > MAX_WRANGLER_SIZE) {
    const ct = contentType ? `--content-type ${contentType}` : '';
    const cmd = `aws s3 cp ${localPath} s3://${bucket}/${remotePath} --endpoint-url ${R2_ENDPOINT} ${ct}`;
    console.log(`  ↑ ${remotePath} (${fmtSize(localSize)}) [s3]`);
    execSync(cmd, {
      stdio: 'pipe',
      timeout: 600000,
      env: {
        ...process.env,
        AWS_DEFAULT_REGION: 'auto',
        AWS_SHARED_CREDENTIALS_FILE: '',
        AWS_CONFIG_FILE: '',
      },
    });
  } else {
    const ct = contentType ? `--content-type ${contentType}` : '';
    const cmd = `npx wrangler r2 object put ${bucket}/${remotePath} --file ${localPath} --remote ${ct}`;
    console.log(`  ↑ ${remotePath} (${fmtSize(localSize)})`);
    execSync(cmd, { stdio: 'pipe' });
  }

  state.deployed[remotePath] = { size: localSize, mtime: localMtime };
  saveDeployLog(state.deployed);
  state.uploadCount++;
}
