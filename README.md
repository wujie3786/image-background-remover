# Image Background Remover

A modern, AI-powered image background removal tool built with Next.js, deployed on Cloudflare Pages.

## Features

- ✨ **Instant Background Removal** - Remove backgrounds in seconds with AI
- 🔒 **Privacy First** - Images processed in memory, never stored
- 🔐 **Google OAuth** - Secure sign-in with Google account
- 📱 **Responsive Design** - Works perfectly on desktop and mobile
- 🎨 **Before/After Comparison** - Interactive slider to compare results
- ⚡ **Fast Performance** - Optimized with Next.js App Router and Tailwind CSS
- 🌍 **Global CDN** - Deployed on Cloudflare Pages for worldwide speed

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Deployment**: Cloudflare Pages (with native Next.js runtime)
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: Google OAuth 2.0
- **API**: Remove.bg API

## Getting Started

### Prerequisites

- Node.js 18+
- Google OAuth Client ID & Secret
- Remove.bg API key (get free key at https://www.remove.bg/api)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/wujie3786/image-background-remover.git
cd image-background-remover
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
```bash
cp .env.example .env.local
```

4. Fill in your credentials in `.env.local`:
```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
JWT_SECRET=a-secure-random-string-at-least-32-characters
REMOVE_BG_API_KEY=your_api_key
```

5. Create D1 database locally:
```bash
wrangler d1 create image-bg-remover-users
```

6. Update `wrangler.toml` with your D1 database ID:
```toml
[[d1_databases]]
binding = "DB"
database_name = "image-bg-remover-users"
database_id = "YOUR_DATABASE_ID"  # Replace with actual ID from step 5
```

7. Apply database schema:
```bash
wrangler d1 execute image-bg-remover-users --local --file=./schema.sql
```

8. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Google OAuth Setup

### 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloudflare.com/)
2. Create a new project or select existing one
3. Enable **Google Identity Services** API
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Add authorized JavaScript origins:
   - `http://localhost:3000` (development)
   - `https://imagebackgroundremover.world` (production, replace with your domain)
7. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback` (development)
   - `https://imagebackgroundremover.world/api/auth/callback` (production)
8. Copy **Client ID** and **Client Secret**

### 2. Environment Variables

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
JWT_SECRET=a-secure-random-string-at-least-32-characters
```

## Deployment

### Cloudflare Pages

1. Push your code to GitHub

2. Create D1 database in Cloudflare:
```bash
wrangler d1 create image-bg-remover-users
```
   Copy the `database_id` from the output.

3. Update `wrangler.toml` with the database ID:
```toml
[[d1_databases]]
binding = "DB"
database_name = "image-bg-remover-users"
database_id = "YOUR_ACTUAL_DATABASE_ID"
```

4. Apply database schema:
```bash
wrangler d1 execute image-bg-remover-users --remote --file=./schema.sql
```

5. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
6. Navigate to **Workers & Pages** → **Create application** → **Pages**
7. Select **Connect to Git** → Choose your repository
8. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `.next` (not `out` or `dist`)
9. Add environment variables in settings:
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` → Your Google Client ID
   - `GOOGLE_CLIENT_SECRET` → Your Google Client Secret
   - `JWT_SECRET` → Your JWT secret (at least 32 chars)
   - `REMOVE_BG_API_KEY` → Your Remove.bg API key
10. Click **Save and Deploy**

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth Client Secret |
| `JWT_SECRET` | Yes | JWT signing secret (32+ chars) |
| `REMOVE_BG_API_KEY` | Yes | Remove.bg API key |

## Usage

1. Sign in with Google account
2. Upload an image (JPG, PNG, or WEBP, max 10MB)
3. Wait for AI to remove the background
4. Use the slider to compare before/after
5. Download the result

## Project Structure

```
image-background-remover/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── verify/route.ts    # Google OAuth token verification
│   │   │   ├── session/route.ts   # Get current session
│   │   │   └── logout/route.ts    # Logout
│   │   └── remove-bg/
│   │       └── route.ts           # Background removal API
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Home page
│   └── globals.css                # Global styles
├── components/
│   ├── GoogleLogin.tsx            # Google OAuth button
│   ├── UserMenu.tsx               # User dropdown menu
│   ├── Uploader.tsx               # Image upload component
│   ├── ImagePreview.tsx            # Before/After comparison slider
│   └── LoadingSpinner.tsx         # Loading animation
├── lib/
│   ├── auth.ts                    # Auth utilities
│   ├── constants.ts               # App constants
│   ├── db/
│   │   ├── index.ts               # Drizzle DB client
│   │   └── schema.ts              # Database schema
│   └── utils.ts                   # Utility functions
├── types/
│   └── index.ts                   # TypeScript types
├── schema.sql                    # D1 database schema
├── wrangler.toml                 # Cloudflare configuration
├── drizzle.config.ts             # Drizzle ORM config
└── next.config.js                # Next.js configuration
```

## API Reference

### POST /api/auth/verify

Verify Google OAuth credential and create session.

**Request:**
```json
{
  "credential": "google_id_token_or_access_token"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://..."
  }
}
```

### GET /api/auth/session

Get current session status.

**Response:**
```json
{
  "authenticated": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://..."
  }
}
```

### POST /api/auth/logout

Logout and destroy session.

**Response:**
```json
{
  "success": true
}
```

### POST /api/remove-bg

Remove background from an image. **Requires authentication.**

**Request:**
- Content-Type: `multipart/form-data`
- Body: `FormData` with `image` field containing the file

**Response:**
- Success (200): PNG image with transparent background
- Error (401): `{ "error": "Please sign in to use this feature", "code": "UNAUTHORIZED" }`
- Error (400+): JSON object with error message

## Limitations

- Maximum file size: 10MB
- Supported formats: JPG, PNG, WEBP
- API rate limits depend on Remove.bg plan (50 free credits/month)
- Users must sign in before using background removal

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- Issues: [GitHub Issues](https://github.com/wujie3786/image-background-remover/issues)

## Acknowledgments

- [Remove.bg](https://www.remove.bg/) - Background removal API
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Cloudflare Pages](https://pages.cloudflare.com/) - Deployment platform
- [Google Identity Services](https://developers.google.com/identity) - OAuth 2.0

---

Made with ❤️ by [wujie3786](https://github.com/wujie3786)
