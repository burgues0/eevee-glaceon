import { Controller, Get } from '@nestjs/common';

// Unauthenticated, outside the /api prefix (see main.ts) — the k8s liveness
// probe hits the pod directly, never through the gateway's session-cookie path.
@Controller()
export class HealthController {
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}
