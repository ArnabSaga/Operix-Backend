import { readdir, readFile, writeFile } from 'node:fs/promises';

const generatedPrismaDirectory = new URL('../generated/prisma/', import.meta.url);
const relativeImportPattern = /(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g;

await patchDirectory(generatedPrismaDirectory);

async function patchDirectory(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        await patchDirectory(new URL(`${entry.name}/`, directoryUrl));
        return;
      }

      if (entry.isFile() && entry.name.endsWith('.ts')) {
        await patchFile(new URL(entry.name, directoryUrl));
      }
    }),
  );
}

async function patchFile(fileUrl) {
  const original = await readFile(fileUrl, 'utf8');
  const patched = original.replace(
    relativeImportPattern,
    (match, prefix, specifier, suffix) => {
      if (specifier.endsWith('.js') || specifier.endsWith('.json')) {
        return match;
      }

      return `${prefix}${specifier}.js${suffix}`;
    },
  );

  if (patched !== original) {
    await writeFile(fileUrl, patched);
  }
}
