import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import { Reminder, ReminderDocument } from './reminder.schema';
import { UsersService } from '../users/users.service';
import { TelegramService } from '../channels/telegram/telegram.service';
import { WhatsAppService } from '../channels/whatsapp/whatsapp.service';

export interface DeliveryJobData {
  jobType:
    | 'send-message'
    | 'send-reminder'
    | 'batch-broadcast'
    | 'batch-notify';
  /** Present for send-message and send-reminder */
  userId?: string;
  /** Present for batch-broadcast */
  userIds?: string[];
  /** Present for batch-notify */
  seekerUserIds?: string[];
  newPosterId?: string;
  category?: string;
  neighborhood?: string | null;
  newPosterIntent?: string;
  message: string;
  channels?: ('telegram' | 'whatsapp' | 'email')[];
  /** Present for send-reminder — used to mark the reminder delivered */
  reminderId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue('notifications')
    private readonly queue: Queue<DeliveryJobData>,
    @InjectModel(Reminder.name)
    private readonly reminderModel: Model<ReminderDocument>,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Core delivery method — fans out to all verified channels the user has.
   */
  async deliverToUser(userId: string, message: string): Promise<void> {
    const user = await this.usersService.getUserById(userId);
    if (!user) {
      this.logger.warn(`deliverToUser: user ${userId} not found`);
      return;
    }

    for (const identity of user.identities) {
      try {
        if (identity.provider === 'telegram') {
          const telegram = this.moduleRef.get(TelegramService, {
            strict: false,
          });
          await telegram.sendMessage(identity.externalId, message);
        } else if (identity.provider === 'whatsapp') {
          const whatsapp = this.moduleRef.get(WhatsAppService, {
            strict: false,
          });
          await whatsapp.sendMessage(identity.externalId, message);
        } else if (identity.provider === 'email' && identity.verified) {
          await this.sendEmail(
            identity.externalId,
            'Message from Ebere',
            message,
          );
        }
      } catch (err) {
        this.logger.error(
          `Delivery failed for ${identity.provider}:${identity.externalId} — ${(err as Error).message}`,
        );
      }
    }
  }

  /** Enqueue a single message delivery job for one user. */
  async enqueueDelivery(userId: string, message: string): Promise<void> {
    await this.queue.add('send-message', {
      userId,
      message,
      jobType: 'send-message',
    });
  }

  /** Enqueue a batch broadcast to multiple users. Per-user failures do not fail the job. */
  async enqueueBatchBroadcast(
    userIds: string[],
    message: string,
  ): Promise<void> {
    await this.queue.add('batch-broadcast', {
      userIds,
      message,
      jobType: 'batch-broadcast',
    });
  }

  /**
   * Query users in the given neighborhood and enqueue one delivery job per user.
   * Wired fully in Phase 9 once UsersModule is available.
   */
  async broadcastToRunners(
    neighborhood: string,
    message: string,
  ): Promise<void> {
    // TODO Phase 9.2: inject UsersService, query users by neighborhood, enqueue per user
    this.logger.warn(
      `broadcastToRunners stub — neighborhood=${neighborhood} message=${message}`,
    );
  }

  /**
   * Query users whose housingPreferences match and enqueue one delivery job per match.
   * Wired fully in Phase 10 once UsersModule is available.
   */
  async alertMatchingSeekers(
    neighborhood: string,
    rent: number,
    message: string,
  ): Promise<void> {
    // TODO Phase 10.2: inject UsersService, query seekers by preferences, enqueue per user
    this.logger.warn(
      `alertMatchingSeekers stub — neighborhood=${neighborhood} rent=${rent} message=${message}`,
    );
  }

  /** Thin wrapper around MailerService for plain-text email delivery. */
  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    await this.mailerService.sendMail({ to, subject, text });
    this.logger.log(`Email sent to ${to}: ${subject}`);
  }

  /**
   * Save a reminder document and enqueue a delayed BullMQ job.
   * Returns the reminder's MongoDB ID.
   */
  async createReminder(
    userId: string,
    message: string,
    triggerAt: Date,
  ): Promise<string> {
    const reminder = await this.reminderModel.create({
      userId: new Types.ObjectId(userId),
      message,
      triggerAt,
      delivered: false,
    });

    const delay = Math.max(0, triggerAt.getTime() - Date.now());
    const job = await this.queue.add(
      'send-reminder',
      {
        userId,
        message,
        jobType: 'send-reminder',
        reminderId: reminder._id.toString(),
      },
      { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    await this.reminderModel.updateOne(
      { _id: reminder._id },
      { $set: { jobId: job.id } },
    );

    this.logger.log(
      `Reminder ${reminder._id} scheduled for user ${userId} in ${delay}ms`,
    );
    return reminder._id.toString();
  }

  /** Mark a reminder as delivered after the job fires. */
  async markReminderDelivered(reminderId: string): Promise<void> {
    await this.reminderModel.updateOne(
      { _id: reminderId },
      { $set: { delivered: true, deliveredAt: new Date() } },
    );
  }
}
