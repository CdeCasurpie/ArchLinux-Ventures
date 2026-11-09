import { describe, expect, it } from 'vitest';
import { verifyDownload } from '../apps/client/src/features/verify-download';

describe('download integrity', () => {
  const bytes = new TextEncoder().encode('abc');
  const checksum = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  it('accepts matching size and checksum', async () => {
    await expect(verifyDownload(bytes, 3, checksum)).resolves.toBeUndefined();
  });
  it('rejects a truncated file before publication', async () => {
    await expect(verifyDownload(bytes, 4, checksum)).rejects.toThrow('incompleto');
  });
  it('rejects corrupted data even with the same size', async () => {
    await expect(verifyDownload(new TextEncoder().encode('abd'), 3, checksum)).rejects.toThrow('checksum');
  });
});
