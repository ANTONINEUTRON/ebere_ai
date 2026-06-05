import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MediaFileDocument = HydratedDocument<MediaFile>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class MediaFile {
  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['telegram', 'whatsapp'] })
  channel!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  storagePath!: string;

  @Prop()
  linkedCollection?: string;

  @Prop({ type: Types.ObjectId })
  linkedId?: Types.ObjectId;
}

export const MediaFileSchema = SchemaFactory.createForClass(MediaFile);
