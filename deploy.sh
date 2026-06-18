#!/bin/bash
set -e

echo "🚀 Starting Deployment Process..."

# Pull latest changes from Github
echo "📦 Pulling latest code..."
git pull origin main

# Install new dependencies
echo "📥 Installing dependencies..."
bun install

# Run database migrations
echo "🗄️ Running database migrations..."
bun run migrate

# Build the Next.js app
echo "🏗️ Building Next.js application..."
bun run build

# Restart PM2 processes
echo "🔄 Restarting background processes..."
pm2 restart clipper-web || pm2 start "bun run start" --name "clipper-web" --cwd "apps/web"
pm2 restart clipper-worker || pm2 start "bun run src/index.ts" --name "clipper-worker" --cwd "apps/worker"

# Save PM2 state
pm2 save

echo "✅ Deployment Successful!"
