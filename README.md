# Image Background Remover

A modern, AI-powered image background removal tool built with Next.js, deployed on Cloudflare Pages.

## Features

- ✨ **Instant Background Removal** - Remove backgrounds in seconds with AI
- 🔒 **Privacy First** - Images processed in memory, never stored
- 📱 **Responsive Design** - Works perfectly on desktop and mobile
- 🎨 **Before/After Comparison** - Interactive slider to compare results
- ⚡ **Fast Performance** - Optimized with Next.js App Router and Tailwind CSS
- 🌍 **Global CDN** - Deployed on Cloudflare Pages for worldwide speed

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Deployment**: Cloudflare Pages
- **API**: Remove.bg API

## Getting Started

### Prerequisites

- Node.js 18+ 
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

4. Add your Remove.bg API key to `.env.local`:
```
REMOVE_BG_API_KEY=your_api_key_here
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Cloudflare Pages

1. Push your code to GitHub
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
3. Navigate to **Workers & Pages** → **Create application** → **Pages**
4. Select **Connect to Git** → Choose your repository
5. Configure build settings:
   - **Build command**: `npm run pages:build`
   - **Build output directory**: `.vercel/output/static`
6. Add environment variable:
   - `REMOVE_BG_API_KEY` → Your API key
7. Click **Save and Deploy**

### Environment Variables

- `REMOVE_BG_API_KEY`: Required. Get it from [Remove.bg](https://www.remove.bg/api)

## Usage

1. Upload an image (JPG, PNG, or WEBP, max 10MB)
2. Wait for AI to remove the background
3. Use the slider to compare before/after
4. Download the result

## Project Structure

```
image-background-remover/
├── app/
│   ├── api/
│   │   └── remove-bg/
│   │       └── route.ts       # API endpoint for background removal
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page
│   └── globals.css             # Global styles
├── components/
│   ├── Uploader.tsx            # Image upload component
│   ├── ImagePreview.tsx        # Before/After comparison slider
│   └── LoadingSpinner.tsx      # Loading animation
├── lib/
│   ├── constants.ts            # App constants
│   └── utils.ts                # Utility functions
├── types/
│   └── index.ts                # TypeScript types
├── public/                     # Static assets
├── next.config.ts              # Next.js configuration
├── tailwind.config.ts          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── wrangler.toml               # Cloudflare Pages configuration
```

## API Reference

### POST /api/remove-bg

Remove background from an image.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `FormData` with `image` field containing the file

**Response:**
- Success (200): PNG image with transparent background
- Error (400+): JSON object with error message

**Example:**
```typescript
const formData = new FormData()
formData.append('image', file)

const response = await fetch('/api/remove-bg', {
  method: 'POST',
  body: formData,
})

const blob = await response.blob()
```

## Limitations

- Maximum file size: 10MB
- Supported formats: JPG, PNG, WEBP
- API rate limits depend on Remove.bg plan (50 free credits/month)

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- Issues: [GitHub Issues](https://github.com/wujie3786/image-background-remover/issues)
- Email: Support via Remove.bg

## Acknowledgments

- [Remove.bg](https://www.remove.bg/) - Background removal API
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Cloudflare Pages](https://pages.cloudflare.com/) - Deployment platform

---

Made with ❤️ by [wujie3786](https://github.com/wujie3786)
