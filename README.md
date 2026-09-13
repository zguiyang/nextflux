# Nextflux

A modern web-based RSS reader for [Miniflux](https://github.com/miniflux/v2), built with React, Vite, and HeroUI.

This repository follows [electh/nextflux](https://github.com/electh/nextflux) and adds personal features, usability improvements, and deployment customizations on top of it.

![Nextflux preview](images/preview.png)
![Nextflux dark mode](images/dark.png)
![Nextflux settings](images/settings.png)
![Nextflux article editing](images/edit.png)

## Features

### Reading and feed management

- Connect to any Miniflux server using its server URL and API credentials
- Automatic background synchronization with a configurable interval
- Incremental article synchronization with local browser storage
- Mark articles as read while scrolling
- Global **All Articles** and **Starred Articles** views in the sidebar
- Unread and starred article counts for quick navigation
- OPML import, category organization, feed hiding, feed discovery, and search
- Image gallery with touch gestures
- Responsive article navigation with touch-friendly mobile transitions
- Save articles to supported third-party services
- Keyboard shortcuts for common navigation and reading actions
- Light and dark themes with additional appearance controls
- English, Chinese, Turkish, and French translations

## Fork additions

The following completed changes are specific to this fork compared with the original [electh/nextflux](https://github.com/electh/nextflux) project:

| Status | Area | Fork addition | Description |
| --- | --- | --- | --- |
| ✅ | Navigation | Global Starred Articles view | Adds a dedicated **Starred Articles** entry in the sidebar for viewing starred articles across feeds. |
| ✅ | Feed reliability | Visible feed parsing errors | Shows a warning indicator for feeds with parsing failures, including the server-provided or fallback error message. |
| ✅ | Feed reliability | More reliable manual refresh | Waits for the server refresh and the following local synchronization, so success and error notifications reflect the actual result. |
| ✅ | Reading performance | On-demand reading fonts | Avoids network requests for system fonts and loads selected web fonts only when they are needed. |
| ✅ | PWA | Improved installation support | Provides a complete web app manifest and standalone display configuration without requiring offline caching or a service worker. |
| ✅ | AI | Capability-based AI configuration | Separates providers, models, prompts, and capabilities, then lets each AI capability bind its own model and prompt. Also adds model discovery through `/models`, manual model fallback, and an independent connection test for the existing article AI summary feature. |
| ✅ | Reading | Bilingual reading mode | Adds on-demand bilingual reading with locale-aware target languages, content filtering, language matching checks, streamed translation, and a simple toggle in the article toolbar. |
| ✅ | Reading | Persistent bilingual translation cache | Reuses completed translations across sessions through local browser storage, with source/config-aware cache keys and background maintenance for expiry and size limits. |
| ✅ | Article list | Flexible article sorting | Adds temporary list sorting controls for publication or creation time in ascending or descending order, alongside a unified default sorting setting. |
| ✅ | Deployment | Fork-specific Cloudflare Pages guidance | Documents the recommended global static deployment workflow and the browser-side connectivity requirements for Miniflux and AI providers. |

## Requirements

- Node.js 20 or newer for local development
- A running [Miniflux](https://miniflux.app/) server

## Getting started

Clone this repository and install its dependencies:

```bash
git clone https://github.com/zguiyang/nextflux.git
cd nextflux
npm ci
```

Start the development server:

```bash
npm run dev
```

Open the displayed local URL, then provide:

- Your Miniflux server URL
- An API token, or a Miniflux username and password

To create a production build locally:

```bash
npm run build
npm run preview
```

## Deployment

Cloudflare Pages is the recommended deployment platform for this project. Nextflux is a static Vite frontend, so it can be built and served globally without maintaining a separate application server.

### Recommended: Cloudflare Pages

1. Push this repository to your GitHub account.
2. In the Cloudflare dashboard, open **Workers & Pages** and choose **Create application**.
3. Select **Pages** and connect the GitHub repository containing this fork.
4. Select the `main` branch for production deployments.
5. Use the following build settings:

   - Framework preset: `React (Vite)`
   - Root directory: `/`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node.js version: `20` or newer

6. Click **Save and Deploy**.
7. Optionally add a custom domain from the Cloudflare Pages project settings.

No frontend environment variables are required. After deployment, open the generated site and enter your Miniflux server URL and API credentials in the login screen.

Because the frontend calls Miniflux directly from the browser, the Miniflux server must be reachable from the deployed site. Use HTTPS for the Miniflux endpoint in production and ensure its reverse proxy or access policy permits requests from the site where necessary.

Cloudflare Pages automatically creates new deployments when changes are pushed to the configured branch, which makes it a good fit for maintaining this fork independently.

### Docker

Docker is an alternative for self-hosting or local environments. Build the image from this repository so that the container runs this fork's code:

```bash
docker build -t nextflux:local .
docker run -d \
  --name nextflux \
  -p 3000:3000 \
  --restart unless-stopped \
  nextflux:local
```

The container serves the application on port `3000`.

### Docker Compose with Miniflux

The included [compose.yml](./compose.yml) provides a local Miniflux and PostgreSQL stack. Before using it, replace the example credentials with secure values.

```bash
docker compose up -d
```

The compose file currently references the upstream `electh/nextflux` image. To run this fork instead, build `nextflux:local` as shown above and update the `nextflux` service image, or use the standalone Docker instructions. This compose setup is mainly intended for local testing because it exposes example Miniflux credentials.

## PWA installation

Nextflux can be installed as a desktop web app from Chrome or Edge without offline caching or a service worker:

1. Open the deployed app over HTTPS, or use `http://localhost` during local development.
2. Select the install icon in the browser address bar, or choose `Install app` from the browser menu.
3. Launch Nextflux from your applications menu or dock.

The app provides a web app manifest, 192×192 and 512×512 icons, and `display: standalone`. Network access to the Miniflux server is still required for synchronization and article updates.

## Browser support

- Chrome (recommended)
- Firefox
- Safari
- Edge

The interface is primarily designed for desktop use, with responsive behavior and touch-friendly article navigation on mobile devices.

## Development

Available scripts:

```bash
npm run dev      # Start the Vite development server
npm run build    # Build the production bundle
npm run preview  # Preview the production bundle locally
npm run lint     # Run ESLint
npm test         # Run the test suite
```

## Relationship to the upstream project

- Original project: [electh/nextflux](https://github.com/electh/nextflux)
- Original project author: [@electh](https://github.com/electh)
- This repository began as a fork of the upstream project.
- The Git history is retained so the origin of the code and subsequent changes remain traceable.
- Upstream changes and security updates may be incorporated selectively when they are relevant to this fork.
- Feel free to fork, adapt, and build on this project for your own needs—just keep the original attribution and follow the applicable license terms.

## Attribution and license

Please preserve the original project attribution and any applicable third-party notices when redistributing this software.

At the time of writing, this repository and the upstream project do not contain a standard `LICENSE` file. The informal license wording in the upstream README should not be treated as a substitute for a clearly identified open-source license. Before redistributing this derivative project, verify the applicable permissions with the upstream maintainer and retain any license or copyright notices they provide.

## Contributing

Issues and pull requests are welcome for changes that improve this fork. For upstream-specific changes, please open them in the [upstream repository](https://github.com/electh/nextflux) instead.

## Acknowledgements

Thanks to the original Nextflux project and its contributors, including:

- Turkish translation: [@TaylanTatli](https://github.com/TaylanTatli)
- French translation: [@quent1-fr](https://github.com/quent1-fr)

Nextflux also builds on the Miniflux API and the open-source React ecosystem.
