export interface ApplicationConfiguration {
  app: {
    nodeEnvironment: string;
    port: number;
    frontendOrigins: string[];
    frontendAppUrl: string;
    swaggerEnabled: boolean;
  };

  database: {
    url: string;
  };

  auth: {
    secret: string;
    baseUrl: string;
  };

  smtp: {
    enabled: boolean;
    host: string;
    port: number | null;
    secure: boolean;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
  };
}

export default function configuration(): ApplicationConfiguration {
  return {
    app: {
      nodeEnvironment: process.env.NODE_ENV ?? 'development',

      port: Number(process.env.PORT ?? 5000),

      frontendOrigins: (process.env.FRONTEND_URL ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),

      frontendAppUrl: process.env.FRONTEND_APP_URL ?? '',

      swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
    },

    database: {
      url: process.env.DATABASE_URL ?? '',
    },

    auth: {
      secret: process.env.BETTER_AUTH_SECRET ?? '',
      baseUrl: process.env.BETTER_AUTH_URL ?? '',
    },

    smtp: {
      enabled: process.env.SMTP_ENABLED === 'true',
      host: process.env.SMTP_HOST ?? '',
      port:
        process.env.SMTP_PORT === undefined ||
        process.env.SMTP_PORT.trim().length === 0
          ? null
          : Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      fromEmail: process.env.SMTP_FROM_EMAIL ?? '',
      fromName: process.env.SMTP_FROM_NAME ?? 'Operix',
    },
  };
}
