// Must load before AppModule (and anything it transitively requires reads
// process.env at import time, e.g. kubernetes.constants.ts/glaceon.config.ts)
// — ConfigModule.forRoot()'s own dotenv call happens too late for those.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LearningModuleClientExceptionFilter } from './integration-client/learning-module-client-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new LearningModuleClientExceptionFilter());
  app.setGlobalPrefix('api', { exclude: ['health'] });
  await app.listen(process.env.PORT || 3020);
}
bootstrap();
