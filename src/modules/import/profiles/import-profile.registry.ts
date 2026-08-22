import { Injectable } from '@nestjs/common';
import { HistoricalTaskLegacyV1Profile } from './historical-task-legacy-v1.profile.js';
import type { ImportProfile } from './import-profile.interface.js';
import { MemberLegacyV1Profile } from './member-legacy-v1.profile.js';

@Injectable()
export class ImportProfileRegistry {
  private readonly profiles: ImportProfile[] = [
    new MemberLegacyV1Profile(),
    new HistoricalTaskLegacyV1Profile(),
  ];

  list(): ImportProfile[] {
    return this.profiles;
  }
}
