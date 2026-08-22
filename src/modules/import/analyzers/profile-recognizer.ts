import { HttpStatus, Injectable } from '@nestjs/common';
import type { SpreadsheetWorkbook } from '../../../shared/spreadsheet/spreadsheet.interface.js';
import { AppException } from '../../../shared/errors/app.exception.js';
import { IMPORT_ERROR_CODE } from '../import.constant.js';
import type { ImportPreviewIssue } from '../import.interface.js';
import type { ImportProfile } from '../profiles/import-profile.interface.js';
import { ImportProfileRegistry } from '../profiles/import-profile.registry.js';

export interface RecognizedImportProfile {
  profile: ImportProfile;
  structureIssues: ImportPreviewIssue[];
}

@Injectable()
export class ProfileRecognizer {
  constructor(private readonly registry: ImportProfileRegistry) {}

  recognize(workbook: SpreadsheetWorkbook): RecognizedImportProfile {
    const matches = this.registry
      .list()
      .map((profile) => ({
        profile,
        recognition: profile.recognize(workbook),
      }))
      .filter((item) => item.recognition.matches);

    if (matches.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        IMPORT_ERROR_CODE.IMPORT_PROFILE_NOT_FOUND,
        'Workbook does not match a registered Operix import profile.',
      );
    }

    if (matches.length > 1) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        IMPORT_ERROR_CODE.IMPORT_PROFILE_AMBIGUOUS,
        'Workbook matches more than one Operix import profile.',
      );
    }

    const match = matches[0];

    if (!match) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        IMPORT_ERROR_CODE.IMPORT_PROFILE_NOT_FOUND,
        'Workbook does not match a registered Operix import profile.',
      );
    }

    if (match.recognition.structureIssues.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        IMPORT_ERROR_CODE.IMPORT_STRUCTURE_INVALID,
        'Workbook structure is invalid for the recognized profile.',
        {
          issues: match.recognition.structureIssues,
        },
      );
    }

    return {
      profile: match.profile,
      structureIssues: [],
    };
  }
}
