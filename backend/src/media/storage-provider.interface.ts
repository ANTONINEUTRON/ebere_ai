export interface StorageProvider {
  store(
    buffer: Buffer,
    mimeType: string,
    userId: string,
  ): Promise<{ storagePath: string }>;
  storeText(key: string, content: string): Promise<void>;
  fetchText(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
