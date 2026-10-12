#!/bin/bash
# ============================================================
# Production Deployment Script for software.saaiss.in
# Run this on the server to deploy/restart the backend
# Usage: bash deploy.sh
# ============================================================

set -e

echo "🚀 Starting deployment..."

# ---- 1. Pull Latest Code ----
echo "📥 Pulling latest code from main branch..."
git pull origin main

# ---- 2. Install Backend Dependencies ----
echo "📦 Installing backend dependencies..."
cd backend
npm install --production
cd ..

# ---- 3. Verify .env is present (secrets must be injected securely on server) ----
if [ ! -f backend/.env ]; then
  echo "❌ ERROR: backend/.env is missing on the production server!"
  echo "💡 Please provision backend/.env with rotated production credentials before deploying."
  exit 1
else
  echo "✅ backend/.env is present"
fi

# ---- 4. Create logs directory ----
mkdir -p backend/logs

# ---- 5. Stop old PM2 process (if running) ----
echo "🛑 Stopping old PM2 process..."
cd backend
npx pm2 delete financial-backend 2>/dev/null || true

# ---- 6. Start backend with PM2 ----
echo "▶️  Starting backend with PM2..."
npx pm2 start ecosystem.config.cjs --env production
npx pm2 save
cd ..

# ---- 7. Verify backend is alive ----
sleep 3
echo "🔍 Verifying backend health..."
if curl -sf http://localhost:5001/api/health > /dev/null; then
  echo "✅ Backend is alive on port 5001!"
else
  echo "❌ Backend health check failed! Check logs with: pm2 logs financial-backend"
  exit 1
fi

echo ""
echo "✅ Deployment complete!"
echo "   Backend: http://localhost:5001"
echo "   Live:    https://software.saaiss.in"
echo ""
echo "📋 Useful commands:"
echo "   pm2 status               - Check process status"
echo "   pm2 logs financial-backend - View live logs"
echo "   pm2 restart financial-backend - Restart backend"
