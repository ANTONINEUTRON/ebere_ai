import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { dirname, extname, join } from 'path';
import type { StorageProvider } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly uploadRoot = join(process.cwd(), 'uploads');

  async store(
    buffer: Buffer,
    mimeType: string,
    userId: string,
  ): Promise<{ storagePath: string }> {
    const ext = this.extFromMime(mimeType);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const dir = join(this.uploadRoot, userId);

    await mkdir(dir, { recursive: true });

    const fullPath = join(dir, filename);
    await writeFile(fullPath, buffer);

    const storagePath = `uploads/${userId}/${filename}`;
    return { storagePath };
  }

  async storeText(key: string, content: string): Promise<void> {
    const fullPath = join(this.uploadRoot, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  async fetchText(key: string): Promise<string> {
    const fullPath = join(this.uploadRoot, key);
    try {
      return await readFile(fullPath, 'utf-8');
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        throw new NotFoundException(`File not found: ${key}`);
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = join(this.uploadRoot, key);
    try {
      await rm(fullPath);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') return; // idempotent
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
