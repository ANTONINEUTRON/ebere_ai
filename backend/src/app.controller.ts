import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { NotificationsService } from './notifications/notifications.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('hello')
  hello(): { message: string; app: string; slogan: string } {
    return {
      message: 'Hello from Ebere!',
      app: 'Ebere',
      slogan: 'Ebere handles it.',
    };
  }
}
