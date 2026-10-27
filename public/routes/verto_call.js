// Renders the example page. Values here are read from the environment at request time;
// nothing is baked into the source.
const express = require('express');

// Pinned CDN build. Bump deliberately; `npm view @signalwire/js dist-tags` shows what exists.
const CDN_VERSION = '1.5.0';

function localSdkVersion() {
    try {
        return require('@signalwire/js/package.json').version;
    } catch {
        return null;
    }
}

module.exports = function createPageRouter(options = {}) {
    const router = express.Router();
    router.get('/', (req, res) => {
        const mode = (options.sdkVersion || process.env.SDK_VERSION || 'stable') === 'local' ? 'local' : 'stable';
        const local = localSdkVersion();
        res.render('verto_call', {
            sdk: {
                mode,
                cdnVersion: CDN_VERSION,
                localVersion: local,
                loadedVersion: mode === 'local' ? local : CDN_VERSION,
            },
            config: {
                project: options.project ?? process.env.SIGNALWIRE_PROJECT ?? '',
                sdkMode: mode,
                sdkVersion: mode === 'local' ? local : CDN_VERSION,
            },
        });
    });
    return router;
};
