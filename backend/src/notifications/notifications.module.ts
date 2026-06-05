import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { NotificationsService } from './notifications.service';
import { DeliveryWorker } from './delivery.processor';
import { Reminder, ReminderSchema } from './reminder.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    MongooseModule.forFeature([
      { name: Reminder.name, schema: ReminderSchema },
    ]),
    UsersModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('SMTP_HOST', 'localhost'),
          port: parseInt(config.get<string>('SMTP_PORT', '587'), 10),
          secure: false,
          auth: {
            user: config.get<string>('SMTP_USER', ''),
            pass: config.get<string>('SMTP_PASS', ''),
          },
        },
        defaults: {
          from: config.get<string>('MAIL_FROM', '"Ebere" <no-reply@ebere.app>'),
        },
      }),
    }),
  ],
  providers: [NotificationsService, DeliveryWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
