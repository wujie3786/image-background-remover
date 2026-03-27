#!/bin/bash

# Cloudflare Pages Deployment Script
# This script uses Wrangler to deploy to Cloudflare Pages

set -e

CLOUDFLARE_API_TOKEN="cfat_r1lpLhcQyrjdYVC1ot46PX3ftZJVMYVexYVdm6Y49907ead1"
CLOUDFLARE_ACCOUNT_ID="bdd28d8c16775a571f6d890c1390f793"
PROJECT_NAME="image-background-remover"

echo "🚀 Starting Cloudflare Pages deployment..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "📦 Installing Wrangler CLI..."
    npm install -g wrangler
fi

# Set environment variables
export CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID

# Install dependencies
echo "📥 Installing dependencies..."
npm install

# Build for Cloudflare Pages
echo "🔨 Building project..."
npm run pages:build

# Deploy using Wrangler
echo "🌐 Deploying to Cloudflare Pages..."
npx wrangler pages deploy .vercel/output/static --project-name=$PROJECT_NAME

echo "✅ Deployment complete!"
echo "🔗 Your site should be available at: https://$PROJECT_NAME-7tz.pages.dev"
