import { isAbsolute, relative, resolve } from 'node:path';

/** Whether `child` is `parent` or somewhere under it. Both are resolved first, so `..` and trailing slashes don't fool it. */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
