import { parseAnsibleLogResult, parseTerraformLogResult } from './worker-resource-parsers';

describe('worker resource parsers (GLACEON)', () => {
  it('builds a category tree from the marker block and keeps the Tests: summary working', () => {
    const facts = [
      {
        id: 'aws_instance.nginx_server',
        category: 'EC2',
        type: 'aws_instance',
        status: 'ok',
        attributes: [{ key: 'instance_type', value: 't2.micro' }],
        relatedResources: [],
      },
      {
        id: 'aws_vpc.main',
        category: 'Network',
        type: 'aws_vpc',
        status: 'error',
        attributes: [],
        relatedResources: [],
        logs: 'Error: invalid CIDR block',
      },
    ];

    const log = [
      'Running terraform apply...',
      'Tests:       1 passed, 2 total',
      'Tests run!',
      'EEVEE_RESOURCES_JSON_START',
      JSON.stringify(facts),
      'EEVEE_RESOURCES_JSON_END',
    ].join('\n');

    const result = parseTerraformLogResult(log);

    expect(result.passes).toBe(1);
    expect(result.failures).toBe(1);
    expect(result.resources).toHaveLength(2);

    const network = result.resources?.find((node) => node.id === 'Network');
    expect(network?.status).toBe('error');
    expect(network?.children?.[0].logs).toBe('Error: invalid CIDR block');

    const ec2 = result.resources?.find((node) => node.id === 'EC2');
    expect(ec2?.status).toBe('ok');
  });

  it('falls back to an empty resource list when the marker block is missing or malformed', () => {
    expect(parseAnsibleLogResult('Tests:       0 passed, 1 total').resources).toEqual([]);
    expect(
      parseAnsibleLogResult(
        'EEVEE_RESOURCES_JSON_START\nnot json\nEEVEE_RESOURCES_JSON_END',
      ).resources,
    ).toEqual([]);
  });
});
