import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { corsOptions } from './cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.enableCors(corsOptions());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
