import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from '../../../src/shared/pagination/pagination.dto';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../../src/shared/pagination/pagination.helper';

describe('pagination helpers', () => {
  it('uses defaults for missing values', () => {
    expect(normalizePagination({})).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
  });

  it('normalizes low page and limit values', () => {
    expect(normalizePagination({ page: -4, limit: 0 })).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
  });

  it('caps high limits', () => {
    expect(normalizePagination({ page: 2, limit: 500 })).toEqual({
      page: 2,
      limit: 100,
      skip: 100,
      take: 100,
    });
  });

  it('creates pagination metadata', () => {
    expect(createPaginationMeta({ page: 2, limit: 20, total: 41 })).toEqual({
      page: 2,
      limit: 20,
      total: 41,
      totalPages: 3,
    });
  });

  it('rejects non-numeric query values during DTO validation', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      page: 'abc',
      limit: 'def',
    });

    await expect(validate(dto)).resolves.toHaveLength(2);
  });
});
