import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import * as mongoose from 'mongoose';

export type AiSessionDocument = HydratedDocument<AiSession>;

@Schema({ collection: 'adk_sessions' })
export class AiSession {
  @Prop({ required: true, unique: true })
  adkSessionId!: string;

  @Prop({ required: true })
  appName!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  state!: Record<string, unknown>;

  @Prop({ type: [mongoose.Schema.Types.Mixed], default: [] })
  events!: unknown[];

  @Prop({ type: Number, default: Date.now })
  lastUpdateTime!: number;
}

export const AiSessionSchema = SchemaFactory.createForClass(AiSession);
AiSessionSchema.index({ appName: 1, userId: 1 });
