# Smart Email Validation Widget

A lightweight, reusable JavaScript widget that validates an email address as the user types and blocks obviously invalid addresses before signup submission.

**Task:** Real-Time Email Validation Widget  
**Stack:** Vanilla JavaScript, HTML, CSS, Node.js, Express  
**Architecture:** Client-side validation + server-side DNS/MX plausibility check

## Demo

**Live Demo:**  https://smart-email-validation-widget.onrender.com


---

## Features

- Real-time validation while the user types
- Practical client-side email syntax validation
- Disposable-domain detection
- Debounced server verification to avoid unnecessary requests
- Server-side MX lookup using Node.js DNS
- A/AAAA fallback when no MX record is available
- Clear `valid`, `invalid`, and `checking` UI states
- Fail-open behavior when the verification service/network is unavailable
- Demo signup form that blocks confirmed invalid addresses
- Validation details showing the checks performed
- Response-time display
- Small in-memory domain cache
- `AbortController` to cancel stale verification requests
- Reusable widget API
- `data-validator-api` configuration for the stretch requirement
- No frontend framework required

---

## Project Structure

```text
smart-email-validation-widget/
│
├── public/
│   ├── index.html
│   ├── styles.css
│   └── email-validator.js
│
├── server.js
├── package.json
└── README.md
```

### Responsibilities

**`public/email-validator.js`**
- Contains the reusable widget
- Performs local syntax validation
- Checks disposable domains
- Debounces verification requests
- Handles valid/invalid/checking states
- Handles network failures gracefully

**`server.js`**
- Exposes `/api/verify-email`
- Repeats important validation on the server
- Performs DNS/MX checks
- Caches domain results
- Returns structured JSON

**`public/index.html`**
- Demo signup form
- Attaches the widget to the email input
- Demonstrates submission behavior and test cases

**`public/styles.css`**
- Demo UI styling

---

## How the Validation Works

The widget uses a layered validation approach:

```text
User types email
       │
       ▼
Local syntax check
       │
       ▼
Disposable-domain check
       │
       ▼
180ms debounce
       │
       ▼
POST /api/verify-email
       │
       ▼
Server-side DNS/MX check
       │
       ▼
Structured JSON response
       │
       ▼
Update UI
```

### 1. Syntax validation

The browser immediately checks obvious formatting problems such as:

- Missing `@`
- Multiple `@` symbols
- Empty local/domain parts
- Whitespace
- Consecutive dots
- Invalid characters
- Invalid domain labels
- Excessive length

This is intentionally a **practical signup-form validator**, not an attempt to implement every possible RFC email edge case.

### 2. Disposable-domain check

A small denylist is maintained in the widget and repeated on the server.

Example:

```text
demo@mailinator.com
```

is rejected.

The list in this demo is intentionally small. In production I would use a maintained disposable-domain dataset or a dedicated verification service.

### 3. MX-style plausibility

The browser sends the address to:

```text
POST /api/verify-email
```

The server extracts the domain and first attempts:

```javascript
dns.resolveMx(domain)
```

If MX records are available, the domain is considered plausible.

If no usable MX result is available, the server performs an A/AAAA lookup as a weaker fallback.

### Important limitation

An MX record does **not** prove that a specific mailbox exists.

For example, a domain may have valid MX records while a particular address on that domain does not exist.

Therefore this project describes the check as **domain-level plausibility**, not mailbox verification.

---

## Keeping the Widget Fast

The assignment asks for real-time feedback with under 200ms perceived latency.

The fast path is handled locally:

```text
Input event
   ↓
Syntax check
   ↓
Disposable check
```

These operations do not require a network request.

The remote check is asynchronous.

### Debouncing

The widget waits approximately **180ms** before starting the remote verification request.

This prevents a request from being sent for every individual keystroke.

For example, instead of sending requests for:

```text
h
ha
ham
hams
hamsa
hamsa@
hamsa@g
...
```

the widget waits briefly for the user to pause typing.

### AbortController

If a previous remote request is still running when a new validation starts, the previous request is aborted.

This helps prevent stale responses from updating the UI after the user has already typed a newer value.

---

## Fail-Open Behavior

The widget distinguishes between a known invalid email and a verification infrastructure failure.

### Blocking cases

```text
Invalid syntax
      ↓
Block

Disposable domain
      ↓
Block

Confirmed DNS/domain failure
      ↓
Block
```

### Non-blocking case

```text
DNS/API/network unavailable
      ↓
Do not block the user
      ↓
Continue signup
```

This follows the assignment requirement:

> Do not block on network errors - fail open gracefully.

A network failure is not proof that the user's email is invalid.

For a high-risk production workflow, this policy could be changed depending on the application's requirements.

---

## Why Validation Is Done on Both Client and Server

Client-side validation is primarily for **speed and user experience**.

It cannot be trusted as the only enforcement layer because users can modify or bypass browser JavaScript.

The server therefore repeats important checks.

```text
Browser
  └── Fast UX validation

Server
  └── Final validation/enforcement
```

---

## Caching

The backend maintains a small in-memory cache keyed by domain.

For example:

```text
gmail.com → MX result
```

The cache lasts for 10 minutes in this demo.

This is useful because DNS verification is domain-level. Multiple users may use the same domain, so the application does not need to repeat the same lookup unnecessarily.

For a multi-instance production deployment, I would replace the in-memory cache with a shared cache such as Redis.

---

## Run Locally

### Requirements

- Node.js 18 or newer
- npm

### Install

```bash
npm install
```

### Start

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

---

## Test Cases

The demo includes quick test buttons.

### Valid

```text
hamsadixit202@gmail.com
```

Expected:

```text
Syntax → Passed
Disposable → Not detected
DNS/MX → MX record
Status → Valid
```

### Invalid syntax

```text
wrong@@gmail.com
```

Expected:

```text
Syntax → Failed
Status → Invalid
```

### Disposable domain

```text
demo@mailinator.com
```

Expected:

```text
Disposable domain → Detected
Status → Invalid
```

### DNS/domain check

```text
person@definitely-not-a-real-domain-12345.example
```

Expected behavior depends on DNS resolution, but it demonstrates the remote verification path.

---

## Embedding the Widget

The widget is designed to attach to an existing email input.

```html
<input
  id="signupEmail"
  type="email"
  data-validator-api="/api/verify-email"
>

<script src="/email-validator.js"></script>

<script>
  EmailValidator.attach("#signupEmail");
</script>
```

The widget API also supports explicit configuration:

```javascript
EmailValidator.attach("#signupEmail", {
  api: "/api/verify-email",
  debounceMs: 180
});
```

This is the basis of the optional single-script/data-attribute stretch requirement.

---

## Real API Integration

The frontend should not contain a third-party verification API key.

Instead:

```text
Browser
   │
   ▼
Your backend
   │
   ▼
Email verification provider
   │
   ▼
Your backend
   │
   ▼
Browser
```

The existing endpoint:

```text
POST /api/verify-email
```

can remain the interface.

A production backend could call a real verification provider and return a simple response such as:

```json
{
  "valid": true,
  "reason": "Domain has valid mail routing."
}
```

This keeps the frontend independent of the specific provider.

---

## Production Improvements

If this were moved beyond the assignment, I would:

1. Replace the small disposable-domain list with a maintained source.
2. Use a shared cache such as Redis for multiple server instances.
3. Add API rate limiting.
4. Add automated unit and integration tests.
5. Add structured logging and monitoring.
6. Use HTTPS.
7. Keep third-party API credentials only on the server.
8. Add stronger abuse protection.
9. Integrate a dedicated email-verification provider if mailbox-level verification is required.
10. Add configurable timeout and cache settings.

---

## Deployment

This project can be deployed as a Node.js Web Service.

Recommended deployment for this assignment: **Render**.

### Render settings

Create a **Web Service** connected to this GitHub repository.

Use:

```text
Language: Node
Build Command: npm install
Start Command: npm start
```

No database or environment variables are required for the demo.

Render provides an `onrender.com` URL after deployment.


---

