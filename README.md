# Smart Email Validation Widget — Task 1

A lightweight reusable JavaScript widget with client-side syntax/disposable checks and server-side DNS/MX verification.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000.

## Main design

Browser:
1. Syntax validation
2. Disposable-domain check
3. 180ms debounce
4. API request

Server:
1. Normalize input
2. Repeat validation
3. Disposable check
4. MX lookup
5. A/AAAA fallback
6. 10-minute domain cache
7. Structured JSON response

The demo intentionally exposes validation details and quick test cases so the behavior can be demonstrated live during review.

## Important limitation

An MX record proves domain-level mail routing, not that a specific mailbox exists. A production system needing mailbox-level verification could integrate a dedicated provider behind the backend.

## Production improvements

Use a maintained disposable-domain source, Redis/shared cache, rate limiting, automated tests, monitoring, HTTPS, and a production verification provider where appropriate.
