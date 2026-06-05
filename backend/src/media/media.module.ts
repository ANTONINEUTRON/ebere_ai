import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaFile, MediaFileSchema } from './media-file.schema';
import { MediaService } from './media.service';
import { LocalStorageProvider } from './local.storage-provider';
import { GcsStorageProvider } from './gcs.storage-provider';
import { STORAGE_PROVIDER } from './storage-provider.interface';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: MediaFile.name, schema: MediaFileSchema },
    ]),
  ],
  providers: [
    MediaService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('GCS_BUCKET')
          ? new GcsStorageProvider(config)
          : new LocalStorageProvider(),
    },
  ],
  exports: [MediaService, STORAGE_PROVIDER],
})
export class MediaModule {}
