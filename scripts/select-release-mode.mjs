import { appendFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const changesetDirectory = resolve(import.meta.dirname, '..', '.changeset');
const hasReleaseIntent = readdirSync(changesetDirectory).some(
  (filename) => filename.endsWith('.md') && filename !== 'README.md'
);
const mode = hasReleaseIntent ? 'version' : 'publish';

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
}
process.stdout.write(`${mode}\n`);
