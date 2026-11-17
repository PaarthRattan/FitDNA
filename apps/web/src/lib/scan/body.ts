/**
 * Reads a request body into memory, refusing it as soon as it passes `cap` bytes, so an
 * oversized upload is never held in full. Returns null when it's too large.
 */
export async function readCapped(stream: ReadableStream<Uint8Array> | null, cap: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
