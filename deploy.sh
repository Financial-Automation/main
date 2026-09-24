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

# ---- 3. Create .env if missing (ecosystem.config.cjs has env vars built-in) ----
if [ ! -f backend/.env ]; then
  echo "📝 Creating backend/.env..."
  cat > backend/.env << 'EOF'
PORT=5001
DEV_MODE=false
PRO_MONGO_URI=mongodb+srv://devsynth01_db_user:UcgRRYzXdhNUX7LH@cluster0.eil2puq.mongodb.net/Financialautomation?retryWrites=true&w=majority
DEV_MONGO_URI=mongodb://localhost:27017/Financialautomation
JWT_SECRET=0069cff5788a79456b669c22226ae865030898099c7b76467ae1cbdf12cdbea29a4fb839215600cb3af802cde900104e85ce421ff2a02a33920282359c3825c4
RAZORPAY_KEY_ID=rzp_live_RWuD5WAyVeoZep
RAZORPAY_KEY_SECRET=IkgmVjTFl76wpRfpni8TBnLR
OPENROUTER_API_KEY=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
APP_URL=https://software.saaiss.in
EOF
  echo "✅ backend/.env created"
else
  echo "✅ backend/.env already exists"
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
