import fs from 'node:fs';
import path from 'node:path';

function collectSourceFiles(rootDir: string): string[] {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }

  return files;
}

describe('legacy Firebase admin service imports', () => {
  it('is not imported anywhere in the shipped frontend source tree', () => {
    const srcRoot = path.join(process.cwd(), 'src');
    const sourceFiles = collectSourceFiles(srcRoot);
    const importingFiles = sourceFiles.filter((filePath) => {
      const normalizedPath = filePath.split(path.sep).join('/');
      if (
        normalizedPath.endsWith('/src/services/admin.ts') ||
        normalizedPath.endsWith('/src/__tests__/legacy-admin-service-imports.test.ts')
      ) {
        return false;
      }

      const contents = fs.readFileSync(filePath, 'utf-8');
      return (
        contents.includes("@/services/admin") ||
        contents.includes("../services/admin") ||
        contents.includes("/services/admin")
      );
    });

    expect(importingFiles).toEqual([]);
  });
});
