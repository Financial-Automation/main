module.exports = {
  apps: [{
    name: 'financial-backend',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      PORT: 5001,
      DEV_MODE: 'false',
      PRO_MONGO_URI: 'mongodb+srv://devsynth01_db_user:UcgRRYzXdhNUX7LH@cluster0.eil2puq.mongodb.net/Financialautomation?retryWrites=true&w=majority',
      JWT_SECRET: '0069cff5788a79456b669c22226ae865030898099c7b76467ae1cbdf12cdbea29a4fb839215600cb3af802cde900104e85ce421ff2a02a33920282359c3825c4',
      RAZORPAY_KEY_ID: 'rzp_live_RWuD5WAyVeoZep',
      RAZORPAY_KEY_SECRET: 'IkgmVjTFl76wpRfpni8TBnLR',
      OPENROUTER_API_KEY: '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',
      APP_URL: 'https://software.saaiss.in'
    },
    env: {
      NODE_ENV: 'production',
      PORT: 5001,
      DEV_MODE: 'false',
      PRO_MONGO_URI: 'mongodb+srv://devsynth01_db_user:UcgRRYzXdhNUX7LH@cluster0.eil2puq.mongodb.net/Financialautomation?retryWrites=true&w=majority',
      JWT_SECRET: '0069cff5788a79456b669c22226ae865030898099c7b76467ae1cbdf12cdbea29a4fb839215600cb3af802cde900104e85ce421ff2a02a33920282359c3825c4',
      RAZORPAY_KEY_ID: 'rzp_live_RWuD5WAyVeoZep',
      RAZORPAY_KEY_SECRET: 'IkgmVjTFl76wpRfpni8TBnLR',
      OPENROUTER_API_KEY: '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',
      APP_URL: 'https://software.saaiss.in'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
}
