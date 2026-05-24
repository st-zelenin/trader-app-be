import { CosmosClient, Container, Database, SqlQuerySpec } from '@azure/cosmos';
import { env } from '../config/env';
import { getSecretAsync, SecretsKeys } from '../shared/secrets';

let client: CosmosClient | null = null;

export async function getCosmosClient(): Promise<CosmosClient> {
  if (!client) {
    const key = await getSecretAsync(SecretsKeys.CosmosClient);
    client = new CosmosClient({
      endpoint: env.CosmosDbEndpoint,
      key,
    });
  }
  return client;
}

export async function getDatabase(dbName: string): Promise<Database> {
  const cosmos = await getCosmosClient();
  const { database } = await cosmos.databases.createIfNotExists({ id: dbName });
  return database;
}

export async function getContainer(
  dbName: string,
  containerId: string,
  partitionKeyPath: string
): Promise<Container> {
  const database = await getDatabase(dbName);
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: [partitionKeyPath] },
  });
  return container;
}

export async function executeReadQuery<T>(
  container: Container,
  query: string | SqlQuerySpec
): Promise<T[]> {
  const result: T[] = [];
  const iterator = container.items.query<T>(query);
  while (iterator.hasMoreResults()) {
    const page = await iterator.fetchNext();
    if (page.resources) {
      result.push(...page.resources);
    }
  }
  return result;
}
