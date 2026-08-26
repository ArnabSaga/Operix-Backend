import { Module } from '@nestjs/common';
import { MailTemplateRenderer } from './mail-template.renderer.js';
import { MailService } from './mail.service.js';

@Module({
  providers: [MailTemplateRenderer, MailService],
  exports: [MailService],
})
export class MailModule {}
