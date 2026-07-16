# Security Policy

## Supported versions

KeyP is currently an early-stage project. Security fixes are applied to the latest code on `main` and to the latest tagged release when practical.

| Version | Supported |
| --- | --- |
| 0.1.x / main | Yes |
| Older snapshots | No |

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

1. Use GitHub's **Security → Report a vulnerability** flow when it is available for this repository.
2. If private vulnerability reporting is unavailable, contact the maintainer through the [xrissohn GitHub profile](https://github.com/xrissohn) without publishing exploit details, secrets, or user data.
3. Include the affected component and version, reproduction conditions, impact, and a minimal proof of concept. Redact all credentials and personal data.

The maintainer will acknowledge a valid report as soon as practical, coordinate remediation privately, and publish a security advisory when a fix is ready.

## Deployment warning

The default example configuration is intended for local development. When
`FIREBASE_INSTALLATION_IDENTITY_ENABLED=false`, all unauthenticated requests use one
`ANONYMOUS_INSTALLATION_ID`; multiple users can therefore access the same subscription and feed data.

Do **not** expose that mode to the public internet. Before a shared or production deployment:

- set `FIREBASE_INSTALLATION_IDENTITY_ENABLED=true`;
- set `FIREBASE_APP_CHECK_ENFORCED=true`;
- configure Firebase Admin credentials through a secret manager;
- use a unique webhook secret and rotate it after suspected exposure;
- keep database files and logs outside the public web root;
- restrict outbound RSS access and preserve the private-network SSRF protections;
- set conservative provider budgets and rate limits;
- use TLS and a trusted reverse proxy;
- avoid logging tokens, credentials, full webhook payloads, or personal data.

## Secrets

Never commit `.env`, Firebase service-account JSON, API keys, FCM tokens, webhook secrets, production database files, or logs. Revoke and rotate any credential that is accidentally exposed.
