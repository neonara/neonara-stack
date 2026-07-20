import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';

const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:8000/graphql/',
  credentials: 'include',
});
const authLink = setContext(async (_, { headers }) => {
  const r = await fetch('/api/auth/session');
  const s = r.ok ? await r.json() : null;
  return { headers: { ...headers, ...(s?.djangoAccessToken ? { Authorization: `Bearer ${s.djangoAccessToken}` } : {}) } };
});
const wsLink = typeof window !== 'undefined'
  ? new GraphQLWsLink(createClient({ url: process.env.NEXT_PUBLIC_GRAPHQL_WS_URL ?? 'ws://localhost:8000/graphql/' }))
  : null;
const splitLink = wsLink
  ? split(({ query }) => { const d = getMainDefinition(query); return d.kind === 'OperationDefinition' && d.operation === 'subscription'; }, wsLink, authLink.concat(httpLink))
  : authLink.concat(httpLink);
export const apolloClient = new ApolloClient({ link: splitLink, cache: new InMemoryCache() });
