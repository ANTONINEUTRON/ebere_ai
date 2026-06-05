import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SkillDocument = HydratedDocument<Skill>;

@Schema({ timestamps: true })
export class Skill {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  skillName!: string;

  @Prop({ required: true, maxlength: 300 })
  shortDescription!: string;

  @Prop({ required: true })
  storageKey!: string;

  @Prop({ required: true })
  charCount!: number;
}

export const SkillSchema = SchemaFactory.createForClass(Skill);

SkillSchema.index({ userId: 1, skillName: 1 }, { unique: true });
