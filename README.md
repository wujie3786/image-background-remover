# Image Background Remover

AI-powered image background removal tool. Frontend: Next.js static export deployed on Cloudflare Pages. Backend: Cloudflare Worker API.

## Features

- ✨ **Instant Background Removal** - Remove backgrounds in seconds with AI
- 🔒 **Privacy First** - Images processed in memory, never stored
- 🔐 **Google OAuth** - Secure sign-in with Google account
- 📱 **Responsive Design** - Works perfectly on desktop and mobile
- 🎨 **Before/After Comparison** - Interactive slider to compare results
- ⚡ **Fast Performance** - Optimized with Next.js App Router and Tailwind CSS
- 🌍 **Global CDN** - Deployed on Cloudflare Pages for worldwide speed

## Tech Stack

- **Frontend**: Next.js 15 (App Router, static export)
- **Backend**: Cloudflare Worker (D1, OAuth, quota management)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Deployment**: Cloudflare Pages + Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: Google OAuth 2.0
- **API**: Remove.bg API

## Architecture

```
imagebackgroundremover.world
├── Frontend (Next.js static export) → Cloudflare Pages
└── Backend API (Cloudflare Worker) → image-bg-remover-api.workers.dev
    ├── POST /api/auth           - Google OAuth login
    ├── GET  /api/user/profile  - Get user profile
    ├── GET  /api/user/stats    - Get usage stats
    ├── POST /api/use           - Record usage (quota check)
    └── POST /api/process       - Process image (quota deducted on success)
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Google OAuth Client ID & Secret
- Remove.bg API key (get free key at https://www.remove.bg/api)

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/wujie3786/image-background-remover.git
cd image-background-remover
```

2. Install dependencies:
```bash
pnpm install
```

3. Create D1 database locally:
```bash
wrangler d1 create image-bg-remover-users --local
```

4. Update `wrangler.toml` with the local database path:
```toml
[[d1_databases]]
binding = "DB"
database_name = "image-bg-remover-users"
database_id = "YOUR_LOCAL_DATABASE_ID"
```

5. Run dev server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google Identity Services** API
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Add authorized JavaScript origins:
   - `http://localhost:3000` (development)
   - `https://imagebackgroundremover.world` (production)
7. Add authorized redirect URIs:
   - `https://image-bg-remover-api.workers.dev/api/auth` (development/production)
8. Copy **Client ID** and **Client Secret**

## Deployment

### 1. Create D1 Database

```bash
wrangler d1 create image-bg-remover-users --remote
```
Copy the `database_id` from the output.

### 2. Update wrangler.toml

```toml
[[d1_databases]]
binding = "DB"
database_name = "image-bg-remover-users"
database_id = "YOUR_ACTUAL_DATABASE_ID"
```

### 3. Set Environment Secrets

```bash
# Google OAuth Client Secret
npx wrangler secret put GOOGLE_CLIENT_SECRET

# JWT signing secret (at least 32 random characters)
npx wrangler secret put JWT_SECRET
```

### 4. Set GitHub Actions Secrets

In your GitHub repository settings, add these secrets:
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Your Google Client ID
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare Account ID

### 5. Push to GitHub

Push to `main` branch and GitHub Actions will automatically deploy to Cloudflare Pages.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Google OAuth Client ID (frontend) |
| `GOOGLE_CLIENT_SECRET` | Yes (secret) | Google OAuth Client Secret |
| `JWT_SECRET` | Yes (secret) | JWT signing secret (32+ chars) |

## API Reference

All API endpoints are at `https://image-bg-remover-api.workers.dev`

### POST /api/auth

Google OAuth login. Sends Google credential token, returns session JWT + user data.

**Request:**
```json
{ "credential": "google_id_token" }
```

**Response:**
```json
{
  "token": "session_jwt_token",
  "user": { "id": "...", "email": "...", "name": "...", "plan": "free" }
}
```

### GET /api/user/profile

Get current user profile. Requires `Authorization: Bearer <token>` header.

### GET /api/user/stats

Get usage statistics. Requires authentication.

### POST /api/process

Process image (remove background). **Requires authentication.** Quota is deducted only on successful processing.

**Request:**
```json
{ "image_data": "data:image/..." }
```

## Project Structure

```
image-background-remover/
├── app/                        # Next.js App Router (frontend)
│   ├── page.tsx               # Home page
│   └── components/            # React components
├── worker/
│   └── src/
│       └── index.ts          # Cloudflare Worker API (backend)
├── wrangler.toml              # Cloudflare Workers + D1 config
├── next.config.js             # Next.js static export config
└── package.json
```

## Usage

1. Sign in with Google account
2. Upload an image (JPG, PNG, or WEBP, max 10MB)
3. Wait for AI to remove the background
4. Use the slider to compare before/after
5. Download the result

## Limitations

- Maximum file size: 10MB
- Supported formats: JPG, PNG, WEBP
- Free plan: 5 requests/day
- Pro plan: 50 requests/day

## License

MIT License

## Contributing

Contributions welcome! Please submit a Pull Request.

## Support

- Issues: [GitHub Issues](https://github.com/wujie3786/image-background-remover/issues)

## Acknowledgments

- [Remove.bg](https://www.remove.bg/) - Background removal API
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Cloudflare](https://cloudflare.com/) - Deployment platform
- [Google Identity Services](https://developers.google.com/identity) - OAuth 2.0

---

Made with ❤️ by [wujie3786](https://github.com/wujie3786)
