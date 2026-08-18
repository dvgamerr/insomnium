import { readFile, writeFile } from 'node:fs/promises';
import { inc, valid } from 'semver';

const [requestedVersion, ...flags] = process.argv.slice(2);
if (!requestedVersion) {
  throw new Error('usage: bun run version:workspaces <version|increment> [--preid=<id>] [--dry-run]');
}

const preidFlag = flags.find(flag => flag.startsWith('--preid='));
const preid = preidFlag?.slice('--preid='.length);
const dryRun = flags.includes('--dry-run');
const rootPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const packagePaths = rootPackage.workspaces.map(workspace => new URL(`../${workspace}/package.json`, import.meta.url));
const packages = await Promise.all(packagePaths.map(async path => ({
  path,
  json: JSON.parse(await readFile(path, 'utf8')),
})));
const versions = new Set(packages.map(pkg => pkg.json.version));

if (versions.size !== 1) {
  throw new Error(`workspace versions must match before bumping: ${[...versions].join(', ')}`);
}

const currentVersion = packages[0].json.version;
const nextVersion = valid(requestedVersion)
  ? requestedVersion
  : inc(currentVersion, requestedVersion, undefined, preid);
if (!nextVersion) throw new Error(`invalid version or increment: ${requestedVersion}`);

console.log(`${currentVersion} -> ${nextVersion}`);
if (dryRun) process.exit(0);

for (const pkg of packages) {
  pkg.json.version = nextVersion;
  await writeFile(pkg.path, `${JSON.stringify(pkg.json, null, 2)}\n`);
}

const install = Bun.spawnSync(['bun', 'install', '--lockfile-only'], {
  cwd: new URL('..', import.meta.url),
  stdout: 'inherit',
  stderr: 'inherit',
});
if (install.exitCode !== 0) process.exit(install.exitCode);
