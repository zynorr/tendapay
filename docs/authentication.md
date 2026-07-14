# Authentication

TendaPay uses wallet signatures for freelancer access. Signing in does not send
a transaction or spend gas.

## Sign-in flow

1. The browser requests a challenge for an EVM address.
2. The server creates a five-minute EIP-4361-style message and places its signed
   challenge token in an HttpOnly, SameSite cookie.
3. The wallet signs the exact challenge message.
4. The server verifies the signature against the challenge address.
5. A signed seven-day session cookie identifies the wallet and its deterministic
   workspace.
6. Logout clears both session and challenge cookies.

Challenges include the application origin, Celo chain ID, random nonce, issue
time, and expiration. The message and challenge cookie must both be present for
verification.

## Workspace ownership

Each owner wallet maps to one workspace ID. Management operations pass that ID
into the repository rather than accepting it from request JSON.

| Operation | Access |
| --- | --- |
| List invoices | Authenticated workspace |
| Create invoice | Authenticated workspace |
| Attach or replace a deliverable | Authenticated workspace owner |
| Read a client invoice | Public capability URL |
| Confirm a payment | Public, verified against Celo |
| Download released work | Public capability URL after settlement |
| Purchase through x402 | Public, payment-gated |

Public client routes do not provide access to other invoices because IDs are
unguessable. Expiration and revocation will be added with secure client links.

## Development

When `AUTH_SECRET` is blank outside production, the server creates one random
process-wide secret. Sessions reset when the development server restarts.

`POST /api/auth/demo` signs into the seeded workspace without a wallet. The
route returns `404` when `NODE_ENV=production`.

## Production

Set `AUTH_SECRET` to at least 32 random characters and share the same value
across every application instance. Rotate it only when intentionally revoking
all active freelancer sessions.
