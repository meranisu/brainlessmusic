/**
 * A request URL with its `token` query value replaced, for the request log.
 * Media tokens travel in `?token=` because `<audio src>` cannot send a header;
 * they are short-lived and media-only, but a log is the wrong place to keep a
 * working credential for even two hours.
 */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&#]*/g, '$1[redacted]');
}
