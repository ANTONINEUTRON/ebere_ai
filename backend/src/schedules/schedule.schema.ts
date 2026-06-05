import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as mongoose from 'mongoose';

// ─── Task type definitions ──────────────────────────────────────────────────

export interface WebSearchTask {
  type: 'web_search';
  query: string;
  siteRestrict?: string;
}

export interface AreaDigestTask {
  type: 'area_digest';
  category?: string;
  neighborhood?: string;
}

export interface FinancialReportTask {
  type: 'financial_report';
  period: 'today' | 'week' | 'month';
}

export interface AgentQueryTask {
  type: 'agent_query';
  prompt: string;
}

export type ScheduleTask =
  | WebSearchTask
  | AreaDigestTask
  | FinancialReportTask
  | AgentQueryTask;

// ─── Mongoose document ──────────────────────────────────────────────────────

export type ScheduleDocument = HydratedDocument<Schedule>;

@Schema({ timestamps: true, collection: 'schedules' })
export class Schedule {
  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  cronExpression!: string;

  @Prop({ type: mongoose.Schema.Types.Mixed, required: true })
  task!: ScheduleTask;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Date })
  lastRunAt?: Date;

  @Prop({ required: true, type: Date })
  nextRunAt!: Date;
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);
ScheduleSchema.index({ userId: 1, isActive: 1, nextRunAt: 1 });
