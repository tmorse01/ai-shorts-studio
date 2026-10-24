// Copies text to the clipboard. Rejects when the clipboard is not available, so the caller can say
// so. Read through globalThis so this module needs no DOM typings.
interface ClipboardLike {
  writeText: (text: string) => Promise<void>
}

export async function copyText(text: string): Promise<void> {
  const clipboard = (globalThis as { navigator?: { clipboard?: ClipboardLike } }).navigator
    ?.clipboard
  if (!clipboard) throw new Error('The clipboard is not available.')
  await clipboard.writeText(text)
}
