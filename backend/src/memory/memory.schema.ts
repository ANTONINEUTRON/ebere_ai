import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as mongoose from 'mongoose';

export type MemoryDocument = HydratedDocument<Memory>;

@Schema({ timestamps: true, collection: 'memories' })
export class Memory {
  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  // ── Sparse numeric core ──────────────────────────────────────────────────────
  @Prop({ type: Number })
  amount?: number;

  @Prop({ type: Number })
  quantity?: number;

  @Prop({ type: Date })
  date?: Date;

  // ── Sparse string core (high-frequency filter fields) ───────────────────────
  @Prop({ type: String })
  status?: string;

  @Prop({ type: String })
  intent?: string;

  @Prop({ type: String })
  category?: string;

  @Prop({ type: String })
  neighborhood?: string;

  @Prop({ type: String })
  currency?: string;

  // ── Structural reference ─────────────────────────────────────────────────────
  @Prop({ type: [String] })
  mediaFileIds?: string[];

  // ── LLM-extracted free-form blob ─────────────────────────────────────────────
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

export const MemorySchema = SchemaFactory.createForClass(Memory);

// Indexes
MemorySchema.index({ userId: 1, type: 1, createdAt: -1 });
MemorySchema.index({
  type: 1,
  intent: 1,
  category: 1,
  neighborhood: 1,
  status: 1,
});
MemorySchema.index({ userId: 1, type: 1, date: -1 });
MemorySchema.index({ userId: 1, type: 1, status: 1 });
