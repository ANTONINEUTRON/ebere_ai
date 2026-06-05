import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { extname } from 'path';
import type { StorageProvider } from './storage-provider.interface';

@Injectable()
export class GcsStorageProvider implements StorageProvider {
  private readonly storage: Storage;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.storage = new Storage({
      projectId: config.get<string>('GCS_PROJECT_ID'),
      keyFilename:
        config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || undefined,
    });
    this.bucket = config.getOrThrow<string>('GCS_BUCKET');
  }

  async store(
    buffer: Buffer,
    mimeType: string,
    userId: string,
  ): Promise<{ storagePath: string }> {
    const ext = this.extFromMime(mimeType);
    const objectName = `media/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const file = this.storage.bucket(this.bucket).file(objectName);
    await file.save(buffer, { contentType: mimeType, resumable: false });
    return { storagePath: objectName };
  }

  async storeText(key: string, content: string): Promise<void> {
    const file = this.storage.bucket(this.bucket).file(key);
    await file.save(Buffer.from(content, 'utf-8'), {
      contentType: 'text/plain; charset=utf-8',
      resumable: false,
    });
  }

  async fetchText(key: string): Promise<string> {
    const file = this.storage.bucket(this.bucket).file(key);
    try {
      const [contents] = await file.download();
      return contents.toString('utf-8');
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      if (code === 404) throw new NotFoundException(`Object not found: ${key}`);
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const file = this.storage.bucket(this.bucket).file(key);
    try {
      await file.delete();
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      if (code === 404) return; // idempotent — already gone
      throw err;
    }
  }

  private extFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/aac': '.aac',
      'application/pdf': '.pdf',
    };
    return map[mimeType] ?? extname(mimeType.split('/')[1] ?? 'bin') ?? '.bin';
  }
}
