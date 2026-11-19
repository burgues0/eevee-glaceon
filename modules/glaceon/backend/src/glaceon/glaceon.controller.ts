import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { GlaceonService } from './glaceon.service';
import { getUserAssertion } from './glaceon-session.util';

interface RunOrSubmitBody {
  content: string;
}

// The only API this module's OWN frontend talks to — never platform-api
// directly, never a database. Every route resolves the caller's identity
// from the eevee_module_glaceon cookie, same as any other module per the
// guide's auth flow.
@Controller()
export class GlaceonController {
  constructor(private readonly glaceonService: GlaceonService) {}

  @Get('catalog')
  getCatalog(@Headers('cookie') cookie?: string) {
    return this.glaceonService.listCatalog(getUserAssertion(cookie));
  }

  @Get('activities/:externalActivityId')
  getActivity(
    @Param('externalActivityId') externalActivityId: string,
    @Headers('cookie') cookie?: string,
  ) {
    return this.glaceonService.getActivityForStudent(externalActivityId, getUserAssertion(cookie));
  }

  @Post('activities/:externalActivityId/run')
  run(
    @Param('externalActivityId') externalActivityId: string,
    @Body() body: RunOrSubmitBody,
    @Headers('cookie') cookie?: string,
  ) {
    return this.glaceonService.run(externalActivityId, getUserAssertion(cookie), body.content);
  }

  @Post('activities/:externalActivityId/submit')
  submit(
    @Param('externalActivityId') externalActivityId: string,
    @Body() body: RunOrSubmitBody,
    @Headers('cookie') cookie?: string,
  ) {
    return this.glaceonService.submit(externalActivityId, getUserAssertion(cookie), body.content);
  }
}
