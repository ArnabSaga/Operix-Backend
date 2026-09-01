import {
  expectNoPrivateIdentifiers,
  expectPublicIdentifier,
} from '../../support/assertions/public-identity.assertion';

describe('public identity assertions', () => {
  it('accepts a response containing its public identity and no private identity', () => {
    const response = {
      id: '924b5f7a-9adc-4aa5-9a25-18ba8180dbab',
      team: { id: 'ff798a4c-f430-4389-a7aa-c4710d345ed5' },
    };

    expectNoPrivateIdentifiers(response, [
      'cm-private-user',
      'cm-private-team',
    ]);
    expectPublicIdentifier(response, '924b5f7a-9adc-4aa5-9a25-18ba8180dbab');
  });

  it('rejects a private identifier nested anywhere in a payload', () => {
    expect(() =>
      expectNoPrivateIdentifiers(
        { metadata: { task: { id: 'cm-private-task' } } },
        ['cm-private-task'],
      ),
    ).toThrow();
  });
});
