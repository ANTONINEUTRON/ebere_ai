import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DeliveryJobData, NotificationsService } from './notifications.service';

@Processor('notifications')
export class DeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(DeliveryWorker.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<DeliveryJobData>): Promise<void> {
    this.logger.log(
      `Processing job "${job.name}" (id=${job.id}) for user ${job.data.userId}`,
    );

    switch (job.name) {
      case 'send-message':
      case 'send-reminder':
        await this.notificationsService.deliverToUser(
          job.data.userId ?? 'unknown',
          job.data.message,
        );
        if (job.name === 'send-reminder' && job.data.reminderId) {
          await this.notificationsService.markReminderDelivered(
            job.data.reminderId,
          );
        }
        break;

      case 'batch-broadcast': {
        const recipients = job.data.userIds ?? [];
        this.logger.log(
          `batch-broadcast: delivering to ${recipients.length} recipient(s)`,
        );
        for (const uid of recipients) {
          try {
            await this.notificationsService.deliverToUser(
              uid,
              job.data.message,
            );
          } catch (err) {
            // Per-user failures must not abort the whole batch
            this.logger.error(
              `Delivery failed for user ${uid}: ${(err as Error).message}`,
            );
          }
        }
        break;
      }

      case 'batch-notify': {
        const seekers = job.data.seekerUserIds ?? [];
        const { category, neighborhood, newPosterIntent } = job.data;
        const itemLabel = category ?? 'item';
        const locationPart = neighborhood ? ` near ${neighborhood}` : '';
        const action = newPosterIntent === 'offer' ? 'offering' : 'looking for';
        const msg =
          `Someone is ${action} ${itemLabel}${locationPart}. ` +
          `Ask Ebere to search and connect!`;
        this.logger.log(
          `batch-notify: delivering to ${seekers.length} seeker(s)`,
        );
        for (const uid of seekers) {
          try {
            await this.notificationsService.deliverToUser(uid, msg);
          } catch (err) {
            this.logger.error(
              `batch-notify delivery failed for user ${uid}: ${(err as Error).message}`,
            );
          }
        }
        break;
      }

      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }
}
