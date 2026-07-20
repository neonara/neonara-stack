import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');
export default withNextIntl({ experimental: { typedRoutes: true } });
