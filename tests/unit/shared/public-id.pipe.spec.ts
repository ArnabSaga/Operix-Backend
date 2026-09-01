import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { PublicIdPipe } from '../../../src/shared/identity/public-id.pipe';

describe('PublicIdPipe', () => {
  const pipe = new PublicIdPipe();

  it('accepts and brands UUID v4 record locators', () => {
    expect(pipe.transform('84a64118-f008-4fd8-b095-298519091db2')).toBe(
      '84a64118-f008-4fd8-b095-298519091db2',
    );
  });

  it.each([
    'cmabc123',
    '84a64118-f008-3fd8-b095-298519091db2',
    '84a64118-f008-4fd8-7095-298519091db2',
    '',
  ])('rejects non-v4 public identifiers before lookup: %s', (value) => {
    try {
      pipe.transform(value);
      throw new Error('Expected public identifier validation to fail.');
    } catch (error) {
      const exception = error as {
        getStatus: () => number;
        getResponse: () => { code: string };
      };
      expect(exception.getStatus()).toBe(400);
      expect(exception.getResponse().code).toBe(
        APP_ERROR_CODE.VALIDATION_ERROR,
      );
    }
  });
});
