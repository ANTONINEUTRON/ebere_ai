import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Skill, SkillSchema } from './skill.schema';
import { SkillsService } from './skills.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Skill.name, schema: SkillSchema }]),
    MediaModule,
  ],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
