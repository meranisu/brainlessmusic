import { randomInt } from 'node:crypto';

/** A cryptographically random string of `length` characters drawn from `alphabet`. */
export function randomCode(alphabet: string, length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += alphabet[randomInt(alphabet.length)];
  return code;
}
