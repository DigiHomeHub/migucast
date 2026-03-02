[English](README.md) | [中文](README.zh-CN.md)

# migucast

Convert Migu Video streams into IPTV-compatible playlists and streaming endpoints.

![Node.js >= 20](https://img.shields.io/badge/Node.js-%3E%3D%2020-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-F69220?logo=pnpm&logoColor=white)
[![CI](https://github.com/DigiHomeHub/migucast/actions/workflows/ci.yml/badge.svg)](https://github.com/DigiHomeHub/migucast/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/DigiHomeHub/migucast/branch/main/graph/badge.svg)](https://codecov.io/gh/DigiHomeHub/migucast)
[![code style: google](https://img.shields.io/badge/code%20style-google-blueviolet.svg)](https://google.github.io/styleguide/tsguide.html)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Docker: ghcr.io](https://img.shields.io/badge/Docker-ghcr.io-2496ED?logo=docker&logoColor=white)](https://ghcr.io/digihomehub/migucast)

## Overview

**migucast** is a self-hosted HTTP server that aggregates live TV streams from [Migu Video](https://www.miguvideo.com/) and exposes them as standard IPTV endpoints. It outputs M3U playlists, plain-text channel lists, and XMLTV EPG data — ready for use with any IPTV player.

This project is a ground-up TypeScript rewrite of [develop202/migu_video](https://github.com/develop202/migu_video), adding strict type safety via Zod-validated configuration, a comprehensive Vitest test suite, and a multi-stage Docker build.

## Features

- Live TV channel aggregation from Migu Video and zbpro sources
- M3U / TXT / XMLTV EPG output compatible with major IPTV players
- Configurable quality tiers: SD, HD, FHD, UHD, and 4K
- HDR and H.265 (HEVC) codec support
- URL-based authentication with optional password protection
- Automatic Migu token refresh
- Periodic channel and EPG data updates on a configurable interval
- Docker-ready with a multi-stage Alpine build (~50 MB image)

## Quick Start

### Node.js

```bash
git clone https://github.com/DigiHomeHub/migucast.git
cd migucast
corepack enable
pnpm install
pnpm build
pnpm start
```

The server starts at `http://localhost:1234` by default.

### Docker

```bash
docker run -d -p 1234:1234 --name migucast ghcr.io/digihomehub/migucast:latest
```

## Configuration

All settings are read from environment variables. Defaults work out of the box for anonymous HD streaming.

| Variable          | Default | Type    | Description                                                      |
| ----------------- | ------- | ------- | ---------------------------------------------------------------- |
| `muserId`         | `""`    | string  | Migu account user ID (obtain from the web client after login)    |
| `mtoken`          | `""`    | string  | Migu account token (obtain from the web client after login)      |
| `mport`           | `1234`  | number  | HTTP server listen port                                          |
| `mhost`           | `""`    | string  | Public-facing base URL, e.g. `http://your-ip:1234`               |
| `mrateType`       | `3`     | number  | Stream quality: `2` SD, `3` HD, `4` FHD, `7` UHD, `9` 4K         |
| `mpass`           | `""`    | string  | Access password (alphanumeric only); enables path-based auth     |
| `menableHDR`      | `true`  | boolean | Request HDR streams when available                               |
| `menableH265`     | `true`  | boolean | Request H.265 codec (may cause playback issues in some browsers) |
| `mdebug`          | `false` | boolean | Enable verbose debug logging                                     |
| `mupdateInterval` | `6`     | number  | Channel data refresh interval in hours                           |
| `mdataDir`        |         | string  | Data output directory for playlists and EPG; defaults to `cwd()` |
| `mlogLevel`       | `"info"`| string  | Log level: `silly`, `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `mlogFile`        |         | string  | Log file path; defaults to `<mdataDir>/migucast.log` when `mdataDir` is set |

> FHD and above require a logged-in account with an active VIP subscription.

### Setting environment variables

**Linux / macOS:**

```bash
mport=3000 mhost="http://localhost:3000" pnpm start
```

**Windows (PowerShell):**

```powershell
$Env:mport=3000; $Env:mhost="http://localhost:3000"; pnpm start
```

**Windows (cmd / Git Bash):**

```bash
set mport=3000 && set mhost="http://localhost:3000" && pnpm start
```

## API Endpoints

| Endpoint              | Response                       |
| --------------------- | ------------------------------ |
| `GET /`               | M3U playlist                   |
| `GET /playlist.m3u`   | M3U file download (attachment) |
| `GET /playlist.txt`   | Plain-text channel list        |
| `GET /epg.xml`        | XMLTV EPG data                 |
| `GET /:channelId`     | 302 redirect to live stream    |
| `GET /interface.txt`  | Alias for `/` (legacy)         |
| `GET /m3u`            | Alias for `/playlist.m3u` (legacy) |
| `GET /txt`            | Alias for `/playlist.txt` (legacy) |

When `mpass` is set, prefix all paths with the password: `GET /:pass/...`

Custom per-request credentials can be passed via the URL: `GET /:userId/:token/:channelId`

## Docker

### Pull and run

```bash
docker run -d \
  -p 1234:1234 \
  --name migucast \
  ghcr.io/digihomehub/migucast:latest
```

### Run with custom configuration

```bash
docker run -d \
  -p 3000:3000 \
  -e mport=3000 \
  -e mhost="http://your-ip:3000" \
  -e mrateType=4 \
  -e muserId="your_user_id" \
  -e mtoken="your_token" \
  --name migucast \
  ghcr.io/digihomehub/migucast:latest
```

### Docker Compose

```yaml
services:
  migucast:
    image: ghcr.io/digihomehub/migucast:latest
    ports:
      - "1234:1234"
    environment:
      - mport=1234
      - mrateType=3
    restart: unless-stopped
```

### Build locally

```bash
docker build -t migucast .
docker run -d -p 1234:1234 --name migucast migucast
```

## Cloudflare Workers

migucast can also run on [Cloudflare Workers](https://workers.cloudflare.com/) (free tier). The Worker entry point is `src/worker.ts`, which uses Workers KV for storage and Cron Triggers for periodic updates.

### First-time setup

```bash
# 1. Install wrangler (included as a dev dependency)
pnpm install

# 2. Authenticate with Cloudflare
npx wrangler login

# 3. Create KV namespaces
npx wrangler kv namespace create MIGUCAST_DATA
npx wrangler kv namespace create MIGUCAST_DATA --preview

# Note the returned IDs for the next step.
```

### Local development

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your values
npx wrangler dev
```

`wrangler dev` reads `.dev.vars` automatically and creates a local KV store — no real namespace ID required.

### Production deployment

Deployment is handled by the `deploy-workers.yml` GitHub Actions workflow, which injects all configuration from repository secrets. Push to `main` or trigger the workflow manually.

#### GitHub Repository Secrets

Configure these in **Settings > Secrets and variables > Actions**:

| Secret                      | Required | Description                                          |
| --------------------------- | -------- | ---------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`      | Yes      | Cloudflare API token with Workers edit permission    |
| `KV_NAMESPACE_ID`           | Yes      | Production KV namespace ID                           |
| `KV_PREVIEW_NAMESPACE_ID`   | Yes      | Preview KV namespace ID                              |
| `UPDATE_SECRET`             | Yes      | Random string for internal update chain auth         |
| `MIGU_USER_ID`              | No       | Migu account user ID (anonymous 720p if omitted)     |
| `MIGU_TOKEN`                | No       | Migu account token                                   |
| `WORKER_HOST`               | No       | Worker URL, e.g. `https://migucast.example.workers.dev` |
| `WORKER_PASS`               | No       | Access password                                      |
| `RATE_TYPE`                 | No       | Stream quality tier (default `3`)                    |
| `ENABLE_HDR`                | No       | Enable HDR (default `true`)                          |
| `ENABLE_H265`               | No       | Enable H.265 (default `true`)                        |
| `UPDATE_INTERVAL`           | No       | Refresh interval in hours (default `6`)              |

#### Manual CLI deployment

If you prefer deploying from your local machine instead of GitHub Actions:

```bash
# Fill in real KV namespace IDs in wrangler.toml (do not commit)
npx wrangler secret put muserId
npx wrangler secret put mtoken
npx wrangler secret put UPDATE_SECRET
# ... set other secrets as needed
npx wrangler deploy
```

## Development

### Prerequisites

- Node.js >= 20 LTS
- pnpm (enable via `corepack enable`)

### Tech stack

- **Language:** TypeScript 5.x with strict mode and ESM modules
- **Validation:** Zod for runtime schema validation
- **Testing:** Vitest with v8 coverage
- **Linting:** ESLint + Prettier
- **Build:** `tsc` to `dist/`

### Pre-commit hooks

[Husky](https://typicode.github.io/husky/) runs the following checks before every commit — identical to the CI pipeline:

- **lint-staged**: `eslint --fix` and `prettier --write` on staged `.ts` files
- **typecheck**: `tsc --noEmit`
- **test**: `vitest run`
- **build**: `tsc -p tsconfig.build.json`

Hooks are installed automatically via `pnpm install` (the `prepare` script).

### Commands

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `pnpm dev`           | Run in development mode (tsx)  |
| `pnpm build`         | Compile TypeScript to `dist/`  |
| `pnpm start`         | Run the compiled server        |
| `pnpm test`          | Run test suite                 |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm lint`          | ESLint check                   |
| `pnpm format`        | Prettier format                |
| `pnpm typecheck`     | Type-check without emitting    |

## Testing

The test suite uses [Vitest](https://vitest.dev/) with v8 coverage. Coverage thresholds are enforced at 50% for statements, branches, functions, and lines.

```bash
pnpm test              # run all tests
pnpm test:coverage     # run with coverage report
```

## Acknowledgments

This project is a TypeScript rewrite of [develop202/migu_video](https://github.com/develop202/migu_video). All credit for the original concept, streaming logic, and protocol reverse-engineering goes to the upstream authors.

## Disclaimer

> **This software is provided for educational and research purposes only.**
>
> 1. This repository does not host, store, or distribute any copyrighted content. It merely provides a tool that interacts with publicly accessible APIs.
> 2. Users are solely responsible for ensuring their use of this software complies with all applicable local laws and regulations.
> 3. The authors disclaim all liability for any direct, indirect, incidental, special, or consequential damages arising from the use or inability to use this software, including but not limited to loss of data, business interruption, or any other commercial damages.
> 4. **Do not use this software in any manner that violates applicable law.** The authors bear no responsibility for any illegal use.
> 5. If any rights holder believes this project infringes their rights, please open an issue for prompt resolution.

## License

[GPL-3.0](LICENSE)
