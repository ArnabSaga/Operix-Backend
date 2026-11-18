import request from 'supertest';

/**
 * Test-only HTTP session helpers.
 *
 * Better Auth 1.7 applies the RFC 6265bis `__Secure-` prefix to the session
 * cookie because the application forces `advanced.useSecureCookies: true`. A
 * plain-HTTP supertest `request.agent()` cookie jar stores that cookie but does
 * not send it back, so an agent-based session round-trip cannot work. These
 * helpers capture the cookie the server actually issued and replay it
 * explicitly. Production cookie configuration is never changed by tests.
 */

type SuperTestServer = Parameters<typeof request>[0];
type SuperTestInstance = ReturnType<typeof request>;
type HttpRequest = ReturnType<SuperTestInstance['get']>;

export interface SessionClient {
  /** The `Cookie` header value replayed on every request. */
  readonly cookie: string;
  get(path: string): HttpRequest;
  post(path: string): HttpRequest;
  patch(path: string): HttpRequest;
  put(path: string): HttpRequest;
  delete(path: string): HttpRequest;
}

/**
 * Reduce `Set-Cookie` header values to `name=value` pairs, discarding attributes
 * so a single header can be replayed. Accepts the array form superagent returns
 * as well as a lone string.
 */
export function toCookiePairs(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? [raw]
      : [];

  return values
    .map((value) => (String(value).split(';')[0] ?? '').trim())
    .filter((pair) => pair.length > 0);
}

/** Sign in over real HTTP and return the issued session cookie. */
export async function signInAndCaptureCookie(
  server: SuperTestServer,
  credentials: { email: string; password: string },
  expectedStatus = 200,
): Promise<string> {
  const response = await request(server)
    .post('/api/v1/auth/sign-in/email')
    .send(credentials);

  if (response.status !== expectedStatus) {
    throw new Error(
      `Sign-in for ${credentials.email} returned ${response.status}, expected ${expectedStatus}.`,
    );
  }

  const pairs = toCookiePairs(response.headers['set-cookie']);
  if (pairs.length === 0) {
    throw new Error(
      `Sign-in for ${credentials.email} did not issue a session cookie.`,
    );
  }

  return pairs.join('; ');
}

/** Build a request factory that replays an existing session cookie. */
export function createSessionClient(
  server: SuperTestServer,
  cookie: string,
): SessionClient {
  return {
    cookie,
    get: (path) => request(server).get(path).set('Cookie', cookie),
    post: (path) => request(server).post(path).set('Cookie', cookie),
    patch: (path) => request(server).patch(path).set('Cookie', cookie),
    put: (path) => request(server).put(path).set('Cookie', cookie),
    delete: (path) => request(server).delete(path).set('Cookie', cookie),
  };
}

/** Sign in and return a cookie-replaying client in one step. */
export async function signInAs(
  server: SuperTestServer,
  credentials: { email: string; password: string },
): Promise<SessionClient> {
  const cookie = await signInAndCaptureCookie(server, credentials);
  return createSessionClient(server, cookie);
}
