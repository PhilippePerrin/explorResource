function toUint8Array(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export async function computeSha256Hex(value: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = toUint8Array(value);
  const digestBytes = new Uint8Array(bytes.byteLength);
  digestBytes.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestBytes as BufferSource);

  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, '0')).join('');
}
