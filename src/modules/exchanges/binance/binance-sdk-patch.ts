import type { ConfigurationRestAPI } from '@binance/common';
import type { Spot } from '@binance/spot';

type ConfigurationWithAxios = ConfigurationRestAPI & {
  baseOptions?: Record<string, unknown>;
};

/** Keep axios body as a string so @binance/common's JSON.parse succeeds. */
function normalizeAxiosResponseBody(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data === null || data === undefined) {
    return '';
  }
  return JSON.stringify(data);
}

/**
 * ConfigurationRestAPI ignores `baseOptions` passed to its constructor.
 * Wire axios transforms on the live configuration object used by sendRequest.
 */
export function wireBinanceRestConfiguration(client: Spot): void {
  const configuration = (
    client.restAPI as unknown as { accountApi: { configuration: ConfigurationWithAxios } }
  ).accountApi.configuration;
  configuration.baseOptions = {
    ...configuration.baseOptions,
    transitional: { forcedJSONParsing: false },
    transformResponse: [normalizeAxiosResponseBody],
  };
}
