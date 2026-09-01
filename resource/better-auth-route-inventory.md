# Better Auth Route Inventory

This inventory records the public exposure decision for the installed Better Auth 1.6.29 runtime. Better Auth keeps private database identity internally; browser responses use public Operix identity only.

| Route | State | Client identity exposure | Decision |
| --- | --- | --- | --- |
| `POST /api/v1/auth/sign-in/email` | Enabled | Native response includes the private User ID | Narrow Better Auth after-hook replaces `user.id` with `User.publicId`; cookie behavior must be verified in integration |
| `GET /api/v1/auth/get-session` | Enabled | Native response includes private User and Session IDs | `customSession` returns public user identity and session expiry only for HTTP; server-side `auth.api.getSession()` retains private identity for guards |
| `POST /api/v1/auth/sign-out` | Enabled | No resource identity in the success body | Preserve |
| `POST /api/v1/auth/request-password-reset` | Enabled | Generic status/message only | Preserve non-enumerating response; mail delivery remains asynchronous |
| `GET /api/v1/auth/reset-password/:token` | Enabled Better Auth implementation route | Redirect behavior; no database record identity | Preserve as implementation behavior, not an Operix stable API contract |
| `POST /api/v1/auth/reset-password` | Enabled | Boolean status only | Preserve |
| `/sign-up/email` | Runtime sign-up disabled | Not available to public callers | Preserve `disableSignUp: true` |
| `/list-sessions` | Disabled | Would expose session records | Disable |
| `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions` | Disabled | Session management is not an Operix V1 public contract | Disable |
| `/update-user`, `/delete-user`, `/change-email` | Disabled | Would return or mutate user/account data outside Operix workflows | Disable |
| `/change-password`, `/set-password` | Disabled | Not part of the approved browser contract | Disable; password reset remains native |
| `/list-accounts`, `/link-social`, `/unlink-account` | Disabled | Account records are server-private | Disable |
| `/refresh-token` | Disabled | Not used by the cookie-session contract | Disable |

## Cookie and guard boundary

- Session cookie caching is not configured.
- The primary cookie contains the opaque Better Auth session token, not a Prisma record ID.
- `@Session()` and the Nest Better Auth guard continue to use private `User.id` and `Session.userId` through the server API.
- Browser `get-session` responses omit `Session.id` and `Session.userId`.
- No generic Nest response interceptor is allowed to rewrite Better Auth responses.

## Release gate

An isolated integration environment must prove sign-in status and cookies are unchanged, client responses contain public User UUIDs only, server guards retain private identity, get-session is sanitized, sign-out invalidates the session, and every enabled route above contains no private database identifier. If the installed runtime cannot meet that contract using supported hooks, release is blocked.
