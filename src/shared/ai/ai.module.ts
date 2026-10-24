import { Module } from '@nestjs/common';
import { AI_PROVIDER } from './ai.constant.js';
import { AiService } from './ai.service.js';
import { GeminiAiProvider } from './gemini-ai.provider.js';

@Module({
  providers: [
    AiService,
    GeminiAiProvider,
    {
      provide: AI_PROVIDER,
      useExisting: GeminiAiProvider,
    },
  ],
  exports: [AiService],
})
export class AiModule {}
