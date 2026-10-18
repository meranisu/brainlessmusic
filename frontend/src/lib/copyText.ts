/** Copies to the clipboard. False when it is refused: the API needs a secure context, and the LAN is plain HTTP. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
