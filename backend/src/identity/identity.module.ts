import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema';
import { UsersModule } from '../users/users.module';
import { LinkRequest, LinkRequestSchema } from './link-request.schema';
import { IdentityService } from './identity.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LinkRequest.name, schema: LinkRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
    UsersModule,
  ],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
