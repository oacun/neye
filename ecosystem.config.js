module.exports = {
  apps: [{
    name: 'igolnoe-ushko',
    script: './server.js',
    
    // Режим кластера для использования всех CPU
    instances: 'max',
    exec_mode: 'cluster',
    
    // Автоматический рестарт при изменениях (только для dev)
    watch: false,
    
    // Переменные окружения
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Логи
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Ограничения памяти
    max_memory_restart: '500M',
    
    // Автоматический перезапуск при ошибках
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Graceful shutdown
    kill_timeout: 5000,
    
    // Задержка между перезапусками при кластере
    wait_ready: true,
    listen_timeout: 10000
  }],

  // Настройки деплоя (опционально)
  deploy: {
    production: {
      user: 'your-user',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/igolnoe-ushko.git',
      path: '/var/www/igolnoe-ushko',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};
