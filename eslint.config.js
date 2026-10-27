const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        ignores: ['node_modules/**', 'drafts/**', 'logs/**', '.claude/**'],
    },
    {
        files: ['app.js', 'public/routes/**/*.js', 'public/handlers/**/*.js', 'test/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
    },
    {
        files: ['public/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: { ...globals.browser, Relay: 'readonly', bootstrap: 'readonly', CodecPrefs: 'readonly' },
        },
    },
];
