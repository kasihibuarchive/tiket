import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  onDemandEntries: {
    maxInactiveAge: 0,
  },
  // Force webpack to transpile radix-ui packages to fix ESM/CJS interop
  // issues that cause "X.A is not a constructor" errors in production builds
  transpilePackages: [
    'recharts',
    '@radix-ui/react-dialog',
    '@radix-ui/react-collapsible',
    '@radix-ui/react-scroll-area',
    '@radix-ui/react-progress',
    '@radix-ui/react-slot',
    '@radix-ui/react-popover',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-tabs',
    '@radix-ui/react-tooltip',
    '@radix-ui/react-select',
    '@radix-ui/react-label',
    '@radix-ui/react-separator',
    '@radix-ui/react-switch',
    '@radix-ui/react-checkbox',
    '@radix-ui/react-toast',
    '@radix-ui/react-alert-dialog',
    '@radix-ui/react-avatar',
    '@radix-ui/react-hover-card',
    '@radix-ui/react-navigation-menu',
    '@radix-ui/react-radio-group',
    '@radix-ui/react-toggle',
    '@radix-ui/react-toggle-group',
    '@radix-ui/react-accordion',
    '@radix-ui/react-menubar',
    '@radix-ui/react-context-menu',
    'clsx',
    'tailwind-merge',
    'class-variance-authority',
  ],
  serverExternalPackages: ['@prisma/client', '@prisma/engines'],
  // Disable webpack module concatenation to prevent TDZ errors from
  // circular dependencies (e.g. recharts ChartUtils ↔ getLegendProps).
  // "Cannot access 'K' before initialization" is caused by webpack inlining
  // circular-dependent modules into a single scope where const/let variables
  // are referenced before their declaration.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization = config.optimization || {};
      config.optimization.concatenateModules = false;
    }
    return config;
  },
};

export default nextConfig;
