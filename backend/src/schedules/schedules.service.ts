import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ModuleRef } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import * as cronParser from 'cron-parser';
import { Schedule, ScheduleDocument, ScheduleTask } from './schedule.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MemoryService } from '../memory/memory.service';
import { RunnerService } from '../agent/runner.service';

export interface CreateScheduleData {
  name: string;
  cronExpression: string;
  task: ScheduleTask;
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    @InjectModel(Schedule.name)
    private readonly scheduleModel: Model<ScheduleDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly memoryService: MemoryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async createSchedule(
    userId: string,
    data: CreateScheduleData,
  ): Promise<ScheduleDocument> {
    const nextRunAt = cronParser
      .parseExpression(data.cronExpression)
      .next()
      .toDate();
    return this.scheduleModel.create({
      userId: new Types.ObjectId(userId),
      name: data.name,
      cronExpression: data.cronExpression,
      task: data.task,
      isActive: true,
      nextRunAt,
    });
  }

  async listSchedules(userId: string): Promise<ScheduleDocument[]> {
    return this.scheduleModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async pauseSchedule(userId: string, scheduleId: string): Promise<void> {
    const schedule = await this.scheduleModel.findById(scheduleId).exec();
    if (!schedule) throw new NotFoundException('Schedule not found');
    if (!schedule.userId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('You do not own this schedule');
    }
    await this.scheduleModel.updateOne(
      { _id: scheduleId },
      { $set: { isActive: false } },
    );
  }

  async deleteSchedule(userId: string, scheduleId: string): Promise<void> {
    const schedule = await this.scheduleModel.findById(scheduleId).exec();
    if (!schedule) throw new NotFoundException('Schedule not found');
    if (!schedule.userId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('You do not own this schedule');
    }
    await this.scheduleModel.deleteOne({ _id: scheduleId });
  }

  @Cron('*/5 * * * *')
  async runDueSchedules(): Promise<void> {
    const now = new Date();
    const due = await this.scheduleModel
      .find({ isActive: true, nextRunAt: { $lte: now } })
      .exec();

    for (const schedule of due) {
      try {
        const result = await this.executeTask(schedule);
        await this.notificationsService.enqueueDelivery(
          schedule.userId.toString(),
          result,
        );
        const nextRunAt = cronParser
          .parseExpression(schedule.cronExpression)
          .next()
          .toDate();
        await this.scheduleModel.updateOne(
          { _id: schedule._id },
          { $set: { lastRunAt: now, nextRunAt } },
        );
        this.logger.log(
          `Schedule ${schedule._id} (${schedule.name}) executed successfully`,
        );
      } catch (err) {
        this.logger.error(
          `Schedule ${schedule._id} (${schedule.name}) failed: ${err}`,
        );
      }
    }
  }

  private async executeTask(schedule: ScheduleDocument): Promise<string> {
    const userId = schedule.userId.toString();
    const task = schedule.task;

    switch (task.type) {
      case 'financial_report': {
        const now = new Date();
        let from: Date;
        if (task.period === 'today') {
          from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (task.period === 'week') {
          from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else {
          from = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        const report = await this.memoryService.aggregateFinancials(
          userId,
          from,
          now,
        );
        return (
          `📊 Scheduled financial report (${task.period}):\n` +
          `Income: ${report.totalIncome}\n` +
          `Expenses: ${report.totalExpenses}\n` +
          `Net: ${report.net}\n` +
          report.dataNote
        );
      }

      case 'area_digest': {
        const results = await this.memoryService.searchRecords(userId, 'post', {
          category: task.category,
          neighborhood: task.neighborhood,
        });
        if (!results.length) {
          return `No active ${task.category ?? 'community'} posts found for ${task.neighborhood ?? 'your area'}.`;
        }
        const lines = results
          .slice(0, 5)
          .map((r, i) => `${i + 1}. ${r.metadata?.['title'] ?? r.category}`);
        return (
          `📍 Area digest — ${task.neighborhood ?? 'your area'}` +
          (task.category ? ` (${task.category})` : '') +
          `:\n${lines.join('\n')}`
        );
      }

      case 'web_search':
      case 'agent_query': {
        // Lazy-resolve via ModuleRef to avoid NestJS circular module registration
        const runner = this.moduleRef.get(RunnerService, { strict: false });
        const prompt =
          task.type === 'web_search'
            ? `Search the web: ${task.query}`
            : task.prompt;
        return runner.run(userId, 'schedule', { text: prompt });
      }
    }
  }
}
