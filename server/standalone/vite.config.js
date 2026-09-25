import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { allowedHostsFromEnv, hostingPlugins } from '../hosting/plugins.js';
import { applyLicenceEnv } from '../hosting/licences.js';
import { apiNotFoundPlugin } from './api-not-found.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load this checkout's configuration and attach its local provider middleware. */
export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  // Hosted profile (docs/LICENCES.md): switches and keys first, so the
  // browser keys below and every provider see them.
  applyLicenceEnv();
  return createBrowserViteConfig({
    plugins: [
      ...hostingPlugins(),
      ...localProviderPlugins(),
      apiNotFoundPlugin(),
    ],
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: process.env.CESIUM_ION_TOKEN,
    host: process.env.HOST,
    port: process.env.PORT,
    extraAllowedHosts: allowedHostsFromEnv(),
  });
});
