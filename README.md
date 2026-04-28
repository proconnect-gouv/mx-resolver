# 📡 MX Resolver

Minimal HTTP service that resolves MX records for a domain. Exists as a separate process because the calling server operates under a security policy that prohibits outbound DNS MX queries directly.

## Usage

```sh
curl https://mx-resolver.proconnect.gouv.fr/beta.gouv.fr
```

```json
[{ "exchange": "mx.ox.numerique.gouv.fr", "priority": 1 }]
```

```sh
curl https://mx-resolver.proconnect.gouv.fr/alpha.gouv.fr
```

```json
{ "error": "ENODATA alpha.gouv.fr" }
```

## API

```
GET /:domain
```

**200** — MX records found

```json
[{ "exchange": "mx.ox.numerique.gouv.fr", "priority": 1 }]
```

**400** — missing or invalid domain

```json
{ "error": "domain required" }
{ "error": "invalid domain" }
```

**404** — no MX records (`ENODATA`, `ENOTFOUND`)

```json
{ "error": "ENODATA alpha.gouv.fr" }
```

**504** — DNS resolver did not respond within 5 seconds

```json
{ "error": "DNS timeout" }
```

## Run

```sh
# Default
# PORT=3000
# RESOLVE_TIMEOUT_MS=5000
node --experimental-strip-types main.ts
```
