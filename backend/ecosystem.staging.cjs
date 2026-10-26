module.exports = {
  apps: [{
    name: 'financial-backend-staging-2w',
    script: 'server.js',
    instances: 2,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 5001,
      DEV_MODE: 'false',
      APP_URL: process.env.APP_URL || 'https://software.saaiss.in'
    },
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 5001,
      DEV_MODE: 'false',
      APP_URL: process.env.APP_URL || 'https://software.saaiss.in'
    },
    error_file: './logs/pm2-error-2w.log',
    out_file: './logs/pm2-out-2w.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
}

