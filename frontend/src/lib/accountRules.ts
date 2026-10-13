/** The server's account rules (`backend/src/routes/auth.ts`), checked here first so a form can say why before sending. */

export const MIN_PASSWORD_LENGTH = 8;
/** `PASSCODE_PATTERN` on the server. */
export const PASSCODE_PATTERN = /^\d{4,8}$/;

/** Server errors start lower-case ("username already taken"); forms show them as sentences. */
export function sentence(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1);
}
