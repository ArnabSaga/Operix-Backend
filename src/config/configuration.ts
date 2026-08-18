export interface ApplicationConfiguration {
  app: {
    nodeEnvironment: string;
    port: number;
    frontendOrigins: string[];
    swaggerEnabled: boolean;
  };

  database: {
    url: string;
  };

  auth: {
    secret: string;
    baseUrl: string;
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

      swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
    },

    database: {
      url: process.env.DATABASE_URL ?? '',
    },

    auth: {
      secret: process.env.BETTER_AUTH_SECRET ?? '',
      baseUrl: process.env.BETTER_AUTH_URL ?? '',
    },
  };
}
