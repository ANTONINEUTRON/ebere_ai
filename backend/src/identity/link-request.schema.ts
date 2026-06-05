import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LinkRequestDocument = HydratedDocument<LinkRequest>;

@Schema({ timestamps: true })
export class LinkRequest {
  /** The user who generated this code and will become the primary after merge. */
  @Prop({ required: true, type: Types.ObjectId })
  fromUserId!: Types.ObjectId;

  /** 6-character alphanumeric code shown to the user. */
  @Prop({ required: true })
  code!: string;

  /** Channel through which the code was generated. */
  @Prop({ required: true, enum: ['whatsapp', 'telegram', 'email'] })
  channel!: 'whatsapp' | 'telegram' | 'email';

  /** Code expires 10 minutes after generation. */
  @Prop({ required: true })
  expiresAt!: Date;

  /** Set when the code is consumed; prevents reuse. */
  @Prop()
  usedAt?: Date;

  /** Set after a successful merge — the primary user the secondary merged into. */
  @Prop({ type: Types.ObjectId })
  mergedIntoUserId?: Types.ObjectId;
}

export const LinkRequestSchema = SchemaFactory.createForClass(LinkRequest);

// Quick lookup for valid (unexpired, unused) codes
LinkRequestSchema.index({ code: 1, expiresAt: 1 });
