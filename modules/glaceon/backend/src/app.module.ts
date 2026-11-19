import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlaceonController } from './glaceon/glaceon.controller';
import { GlaceonService } from './glaceon/glaceon.service';
import { KubernetesService } from './kubernetes/kubernetes.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [GlaceonController],
  providers: [GlaceonService, KubernetesService],
})
export class AppModule {}
