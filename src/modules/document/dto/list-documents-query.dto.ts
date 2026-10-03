import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination.dto.js';
import { DocumentSort, DocumentSource } from '../document.constant.js';

export class ListDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  memberId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  teamId?: string;

  @IsOptional()
  @IsEnum(DocumentSource)
  source?: DocumentSource;

  @IsOptional()
  @IsEnum(DocumentSort)
  sort?: DocumentSort;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;
}
