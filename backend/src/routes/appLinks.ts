import type { FastifyPluginAsync } from 'fastify';

/**
 * Android App Links: lets the app open room links (`/join/<code>`) on this domain without the "open with" prompt.
 * Android fetches this file at install and checks it names the key the APK is signed with. The fingerprint is the
 * release key's (A44), read from a published APK with `apksigner verify --print-certs`; it is public, not a secret.
 * Debug builds (`com.brainlessmusic.app.debug`, the debug key) are left out, so links open the release app.
 */
export const ANDROID_RELEASE_PACKAGE = 'com.brainlessmusic.app';
export const ANDROID_RELEASE_CERT_SHA256 =
  '7B:68:C5:92:EA:A8:6F:C6:C0:8F:2B:CE:2C:72:D3:75:41:39:FE:98:53:F4:69:12:4D:C9:50:D3:D4:EB:7F:0C';

const appLinksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/.well-known/assetlinks.json', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600');
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_RELEASE_PACKAGE,
          sha256_cert_fingerprints: [ANDROID_RELEASE_CERT_SHA256],
        },
      },
    ];
  });
};

export default appLinksRoute;
