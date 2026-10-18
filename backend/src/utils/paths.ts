import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

/** Whether `child` is `parent` or somewhere under it. Both are resolved first, so `..` and trailing slashes don't fool it. */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Symlinks followed when the path exists; the lexical path when it doesn't, so a missing folder still gets its own error. */
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Whether `path` is one of `roots` or under one, after following symlinks on both sides, so a link inside an allowed
 * folder cannot lead out of it. `roots` is a parameter, not read from config here.
 */
export async function isAllowedBrowsePath(path: string, roots: string[]): Promise<boolean> {
  const real = await canonical(path);
  for (const root of roots) {
    if (isInside(real, await canonical(root))) return true;
  }
  return false;
}
