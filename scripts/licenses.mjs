import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const entries = Object.entries(lock.packages).filter(([path, metadata]) => path && !metadata.dev);
const notices = ['Third-party notices\n\nThe converter is MIT licensed. The following dependencies retain their own licenses.\n'];

for (const [path, metadata] of entries.sort(([a], [b]) => a.localeCompare(b))) {
  const files = await readdir(path);
  const licenseFiles = files.filter(file => /^(license|licence|copying|notice)(\.|$)/i.test(file)).sort();
  if (!licenseFiles.length) throw new Error(`No license notice found for ${path}`);
  const manifest = JSON.parse(await readFile(resolve(path, 'package.json'), 'utf8'));
  notices.push(`\n${'='.repeat(72)}\n${manifest.name} ${metadata.version}\nLicense: ${manifest.license || metadata.license}\n${'='.repeat(72)}\n`);
  for (const file of licenseFiles) notices.push((await readFile(resolve(path, file), 'utf8')).trim() + '\n');
}

await writeFile('THIRD_PARTY_NOTICES.txt', notices.join('\n'));
console.log(`Collected notices for ${entries.length} dependencies.`);
