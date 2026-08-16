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
}

export default function configuration(): ApplicationConfiguration {
  return {
    app: {
      nodeEnvironment: process.env.NODE_ENV ?? 'development',
      port: Number(process.env.PORT ?? 3000),
      frontendOrigins: (process.env.FRONTEND_URL ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
    },
    database: {
      url: process.env.DATABASE_URL ?? '',
    },
  };
}
