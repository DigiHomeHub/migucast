[English](README.md) | [中文](README.zh-CN.md)

# migucast

将咪咕视频直播流转换为 IPTV 兼容的播放列表和流媒体端点。

![Node.js >= 20](https://img.shields.io/badge/Node.js-%3E%3D%2020-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-F69220?logo=pnpm&logoColor=white)
[![CI](https://github.com/DigiHomeHub/migucast/actions/workflows/ci.yml/badge.svg)](https://github.com/DigiHomeHub/migucast/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/DigiHomeHub/migucast/branch/main/graph/badge.svg)](https://codecov.io/gh/DigiHomeHub/migucast)
[![code style: google](https://img.shields.io/badge/code%20style-google-blueviolet.svg)](https://google.github.io/styleguide/tsguide.html)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Docker: ghcr.io](https://img.shields.io/badge/Docker-ghcr.io-2496ED?logo=docker&logoColor=white)](https://ghcr.io/digihomehub/migucast)

## 概述

**migucast** 是一个自部署的 HTTP 服务器，聚合[咪咕视频](https://www.miguvideo.com/)的直播电视流，并将其以标准 IPTV 端点的形式对外提供。输出 M3U 播放列表、纯文本频道列表和 XMLTV EPG 数据，可直接用于任意 IPTV 播放器。

本项目是 [develop202/migu_video](https://github.com/develop202/migu_video) 的 TypeScript 完全重写版本，新增了基于 Zod 的严格类型校验配置、完善的 Vitest 测试套件以及多阶段 Docker 构建。

## 功能特性

- 从咪咕视频和 zbpro 源聚合直播电视频道
- 输出 M3U / TXT / XMLTV EPG，兼容主流 IPTV 播放器
- 可配置画质：标清、高清、蓝光、原画、4K
- 支持 HDR 和 H.265 (HEVC) 编解码
- 基于 URL 的认证方式，支持可选的密码保护
- 自动刷新咪咕 Token
- 按可配置的时间间隔定期更新频道和 EPG 数据
- Docker 就绪，多阶段 Alpine 构建（镜像约 50 MB）

## 快速开始

### Node.js

```bash
git clone https://github.com/DigiHomeHub/migucast.git
cd migucast
corepack enable
pnpm install
pnpm build
pnpm start
```

服务默认启动在 `http://localhost:1234`。

### Docker

```bash
docker run -d -p 1234:1234 --name migucast ghcr.io/digihomehub/migucast:latest
```

## 配置

所有配置通过环境变量读取。默认配置即可进行匿名高清播放。

| 变量名            | 默认值  | 类型    | 说明                                                       |
| ----------------- | ------- | ------- | ---------------------------------------------------------- |
| `muserId`         | `""`    | string  | 咪咕账号用户 ID（网页端登录后获取）                        |
| `mtoken`          | `""`    | string  | 咪咕账号 Token（网页端登录后获取）                         |
| `mport`           | `1234`  | number  | HTTP 服务监听端口                                          |
| `mhost`           | `""`    | string  | 公网访问地址，如 `http://your-ip:1234`                     |
| `mrateType`       | `3`     | number  | 画质：`2` 标清、`3` 高清、`4` 蓝光、`7` 原画、`9` 4K       |
| `mpass`           | `""`    | string  | 访问密码（仅限大小写字母和数字），启用后需在路径中携带密码 |
| `menableHDR`      | `true`  | boolean | 可用时请求 HDR 流                                          |
| `menableH265`     | `true`  | boolean | 请求 H.265 编码（部分浏览器可能无法正常播放）              |
| `mdebug`          | `false` | boolean | 开启详细调试日志                                           |
| `mupdateInterval` | `6`     | number  | 频道数据刷新间隔（单位：小时）                             |

> 蓝光及以上画质需要登录且拥有 VIP 会员。

### 设置环境变量

**Linux / macOS：**

```bash
mport=3000 mhost="http://localhost:3000" pnpm start
```

**Windows (PowerShell)：**

```powershell
$Env:mport=3000; $Env:mhost="http://localhost:3000"; pnpm start
```

**Windows (cmd / Git Bash)：**

```bash
set mport=3000 && set mhost="http://localhost:3000" && pnpm start
```

## API 端点

| 端点                    | 响应                          |
| ----------------------- | ----------------------------- |
| `GET /`                 | M3U 播放列表                  |
| `GET /playlist.m3u`     | M3U 文件下载                  |
| `GET /playlist.txt`     | 纯文本频道列表                |
| `GET /epg.xml`          | XMLTV EPG 数据                |
| `GET /:channelId`       | 302 重定向到直播流            |
| `GET /interface.txt`    | `/` 的别名（旧路由兼容）     |
| `GET /m3u`              | `/playlist.m3u` 的别名（旧路由兼容） |
| `GET /txt`              | `/playlist.txt` 的别名（旧路由兼容） |

设置 `mpass` 后，所有路径需添加密码前缀：`GET /:pass/...`

可通过 URL 传递自定义凭证：`GET /:userId/:token/:channelId`

## Docker

### 拉取并运行

```bash
docker run -d \
  -p 1234:1234 \
  --name migucast \
  ghcr.io/digihomehub/migucast:latest
```

### 带自定义配置运行

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

### 本地构建

```bash
docker build -t migucast .
docker run -d -p 1234:1234 --name migucast migucast
```

## 开发

### 环境要求

- Node.js >= 20 LTS
- pnpm（通过 `corepack enable` 启用）

### 技术栈

- **语言：** TypeScript 5.x，strict 模式，ESM 模块
- **校验：** Zod 运行时 Schema 校验
- **测试：** Vitest + v8 覆盖率
- **代码规范：** ESLint + Prettier
- **构建：** `tsc` 编译输出到 `dist/`

### Pre-commit hooks

[Husky](https://typicode.github.io/husky/) 会在每次提交前自动执行以下检查，与 CI 流水线一致：

- **lint-staged**：对暂存的 `.ts` 文件执行 `eslint --fix` 和 `prettier --write`
- **typecheck**：`tsc --noEmit`
- **test**：`vitest run`
- **build**：`tsc -p tsconfig.build.json`

执行 `pnpm install` 时会通过 `prepare` 脚本自动安装 hooks。

### 常用命令

| 命令                 | 说明                         |
| -------------------- | ---------------------------- |
| `pnpm dev`           | 开发模式运行（tsx 直接执行） |
| `pnpm build`         | 编译 TypeScript 到 `dist/`   |
| `pnpm start`         | 运行编译后的服务             |
| `pnpm test`          | 运行测试套件                 |
| `pnpm test:coverage` | 运行测试并生成覆盖率报告     |
| `pnpm lint`          | ESLint 检查                  |
| `pnpm format`        | Prettier 格式化              |
| `pnpm typecheck`     | 类型检查（不输出文件）       |

## 测试

测试套件使用 [Vitest](https://vitest.dev/) 配合 v8 覆盖率。覆盖率阈值强制要求 statements、branches、functions 和 lines 均不低于 50%。

```bash
pnpm test              # 运行全部测试
pnpm test:coverage     # 运行测试并输出覆盖率报告
```

## 致谢

本项目是 [develop202/migu_video](https://github.com/develop202/migu_video) 的 TypeScript 重写版本。原始概念、流媒体逻辑和协议逆向工程的所有功劳归于上游作者。

## 免责声明

> **本软件仅供学习和研究用途。**
>
> 1. 本仓库不托管、存储或分发任何版权内容，仅提供与公开可访问 API 交互的工具。
> 2. 使用本仓库的过程中可能会产生版权数据。对于这些版权数据，本仓库不拥有其所有权。为避免侵权，使用者务必在 24 小时内清除使用过程中产生的版权数据。
> 3. 由于使用本仓库产生的包括但不限于因商誉损失、停工、计算机故障引起的任何性质的直接、间接、特殊、偶然或结果性损害，均由使用者自行承担。
> 4. **禁止在违反当地法律法规的情况下使用本仓库。** 对于使用者在明知或不知当地法律法规不允许的情况下使用本仓库所造成的任何违法违规行为，本仓库不承担任何责任。
> 5. 如官方平台认为本仓库存在不当之处，请提交 Issue 联系处理。

## 许可证

[GPL-3.0](LICENSE)
