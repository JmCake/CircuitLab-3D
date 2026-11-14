import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const out = new URL('../dist-web/', import.meta.url);
await fs.copyFile(new URL('../.deploy/README.md', import.meta.url), new URL('README.md', out));
await fs.writeFile(new URL('.nojekyll', out), '');
await fs.writeFile(new URL('version.json', out), JSON.stringify({
  version: pkg.version,
  commit: process.env.GITHUB_SHA || 'local',
  builtAt: new Date().toISOString(),
}, null, 2) + '\n');
console.log('Prepared public website in dist-web/ (compiled assets only).');
