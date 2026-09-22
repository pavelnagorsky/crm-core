import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

config();

export default defineConfig({
  schema: 'src/database/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
