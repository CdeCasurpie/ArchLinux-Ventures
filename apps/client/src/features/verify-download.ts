/** Called before persisting or publishing a downloaded binary. */
export async function verifyDownload(bytes: Uint8Array, size: number | null, checksum: string | null) {
  if (size !== null && bytes.length !== size) throw new Error('Archivo descargado incompleto');
  if (!checksum) return;
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== checksum.toLowerCase()) throw new Error('El archivo descargado no coincide con su checksum');
}
