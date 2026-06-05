import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MediaFile, MediaFileDocument } from './media-file.schema';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import type { StorageProvider } from './storage-provider.interface';

const ALLOWED_MIME_LIMITS_MB: Record<string, number> = {
  'image/jpeg': 10,
  'image/png': 10,
  'image/webp': 10,
  'image/gif': 10,
  'audio/ogg': 25,
  'audio/mpeg': 25,
  'audio/mp4': 25,
  'audio/aac': 25,
  'application/pdf': 25,
};

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(MediaFile.name)
    private readonly mediaFileModel: Model<MediaFileDocument>,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async store(
    buffer: Buffer,
    mimeType: string,
    userId: string,
    channel: string,
  ): Promise<string> {
    const limitMb = ALLOWED_MIME_LIMITS_MB[mimeType];
    if (!limitMb) throw new BadRequestException('Unsupported file type.');
    if (buffer.length > limitMb * 1024 * 1024)
      throw new BadRequestException('File too large.');

    const { storagePath } = await this.storageProvider.store(
      buffer,
      mimeType,
      userId,
    );

    const doc = await this.mediaFileModel.create({
      userId: new Types.ObjectId(userId),
      channel,
      mimeType,
      storagePath,
    });

    return doc._id.toString();
  }

  async linkToRecord(
    mediaFileId: string,
    collection: string,
    recordId: string,
  ): Promise<void> {
    await this.mediaFileModel.findByIdAndUpdate(mediaFileId, {
      linkedCollection: collection,
      linkedId: new Types.ObjectId(recordId),
    });
  }

  async getStoredFile(mediaFileId: string): Promise<MediaFileDocument | null> {
    return this.mediaFileModel.findById(mediaFileId).exec();
  }
}
