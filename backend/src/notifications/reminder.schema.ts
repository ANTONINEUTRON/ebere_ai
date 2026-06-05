import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReminderDocument = HydratedDocument<Reminder>;

@Schema({ timestamps: true, collection: 'reminders' })
export class Reminder {
  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  message!: string;

  @Prop({ required: true, type: Date })
  triggerAt!: Date;

  @Prop({ default: false })
  delivered!: boolean;

  @Prop({ type: Date })
  deliveredAt?: Date;

  /** BullMQ job ID — used to cancel the job if the reminder is deleted before it fires. */
  @Prop()
  jobId?: string;
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);
ReminderSchema.index({ userId: 1, delivered: 1 });
ReminderSchema.index({ triggerAt: 1 });
