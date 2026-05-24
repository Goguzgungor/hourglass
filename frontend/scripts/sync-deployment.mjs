// Pre-dev / pre-build helpers:
//
// 1. Copies <repo>/deployments/local.json into src/lib/deployment.json so the
//    Next.js build can import it. If the file doesn't exist, writes an empty
//    placeholder so the build still succeeds (the UI shows a notice).
//
// 2. Materialises the local `hourglass` SDK into node_modules. npm installs
//    `file:` deps as a symlink, which Turbopack refuses to follow across the
//    project boundary (`Module not found: Can't resolve 'hourglass'`). Copying
//    the built `dist/` keeps the build hermetic and reproducible.

import { readFile, writeFile, mkdir, cp, lstat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const frontendRoot = resolve(__dirname, '..');

/* ---------- 1. Deployment manifest ---------- */
{
  const src = resolve(repoRoot, 'deployments/local.json');
  const dst = resolve(frontendRoot, 'src/lib/deployment.json');
  await mkdir(dirname(dst), { recursive: true });
  if (existsSync(src)) {
    await writeFile(dst, await readFile(src));
    console.log(`[sync-deployment] copied ${src} -> ${dst}`);
  } else {
    await writeFile(
      dst,
      JSON.stringify(
        {
          network: 'local',
          rpc_url: 'http://localhost:8000/soroban/rpc',
          network_passphrase: 'Standalone Network ; February 2017',
          deployed_at: null,
          deployer: '',
          comptroller: '',
          lockup: '',
          native_token: '',
        },
        null,
        2,
      ),
    );
    console.warn(
      '[sync-deployment] deployments/local.json missing — wrote empty placeholder',
    );
  }
}

/* ---------- 2. Hourglass SDK materialisation ---------- */
{
  const sdkRoot = resolve(repoRoot, 'sdk');
  const target = resolve(frontendRoot, 'node_modules/hourglass');
  const targetDist = resolve(target, 'dist');
  const srcDist = resolve(sdkRoot, 'dist');

  if (!existsSync(srcDist)) {
    console.warn(
      `[sync-deployment] sdk dist not found at ${srcDist} — run \`(cd ../sdk && npm run build)\` first`,
    );
  } else {
    // If `node_modules/hourglass` is a symlink (npm's default for `file:`
    // deps), replace it with a real directory; otherwise just refresh dist/.
    if (existsSync(target)) {
      const st = await lstat(target);
      if (st.isSymbolicLink()) {
        await rm(target, { force: true });
      }
    }
    await mkdir(target, { recursive: true });
    await cp(resolve(sdkRoot, 'package.json'), resolve(target, 'package.json'));
    // Refresh dist/.
    if (existsSync(targetDist)) {
      await rm(targetDist, { recursive: true, force: true });
    }
    await cp(srcDist, targetDist, { recursive: true });
    console.log(`[sync-deployment] materialised hourglass SDK -> ${target}`);
  }
}
