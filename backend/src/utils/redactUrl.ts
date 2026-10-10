/** The request URL with `token` redacted, so logs never hold a working media credential. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&#]*/g, '$1[redacted]');
}
