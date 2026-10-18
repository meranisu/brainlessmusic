import { access } from 'node:fs/promises';

/** True when something exists at `path`. */
export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
