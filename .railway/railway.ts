import {
  defineRailway,
  github,
  image,
  preserve,
  project,
  service,
  volume,
} from 'railway/iac';

export default defineRailway(() => {
  const publicUrl = 'https://apostilbible.com';
  const happyviewData = volume('happyview-data', { sizeMB: 1024 });

  const marginalia = service('marginalia', {
    source: github('a-type/marginalia', { checkSuites: false }),
    replicas: { sfo: 1 },
    env: {
      APP_URL: publicUrl,
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
      PORT: '3000',
      VITE_HAPPYVIEW_CLIENT_KEY: preserve(),
    },
  });

  const happyview = service('happyview', {
    source: image('ghcr.io/gamesgamesgamesgamesgames/happyview:2.15.0'),
    replicas: { sfo: 1 },
    volumeMounts: {
      '/data': happyviewData,
    },
    env: {
      BASE_PATH: '/api',
      DATABASE_URL: 'sqlite:///data/happyview.sqlite?mode=rwc',
      HOST: '0.0.0.0',
      PORT: '3000',
      PUBLIC_URL: marginalia.env.APP_URL,
      RUST_LOG: 'happyview=info,tower_http=info',
      SESSION_SECRET: preserve(),
      TOKEN_ENCRYPTION_KEY: preserve(),
    },
  });

  const caddy = service('caddy', {
    source: github('a-type/marginalia', { checkSuites: false }),
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'Caddy.Dockerfile',
    },
    replicas: { sfo: 1 },
    env: {
      APP_PRIVATE_DOMAIN: marginalia.env.RAILWAY_PRIVATE_DOMAIN,
      CADDY_SITE_ADDRESS: ':80',
      HAPPYVIEW_BASE_PATH: happyview.env.BASE_PATH,
      HAPPYVIEW_PRIVATE_DOMAIN: happyview.env.RAILWAY_PRIVATE_DOMAIN,
    },
  });

  return project('miraculous-connection', {
    resources: [marginalia, happyview, caddy, happyviewData],
  });
});
