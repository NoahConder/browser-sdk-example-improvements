// SignalWire Browser SDK v2 example: Express server.
// Serves the page, the pinned SDK bundle for `SDK_VERSION=local`, and the JWT routes.
const express = require('express');
const path = require('path');
const createPageRouter = require('./public/routes/verto_call');
const createTokenRouter = require('./public/handlers/token_handler');

function createApp(options = {}) {
    const app = express();

    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');
    app.disable('x-powered-by');

    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: false, limit: '10kb' }));
    app.use(express.static(path.join(__dirname, 'public')));
    // Only the SDK's dist folder is exposed, not all of node_modules.
    app.use('/lib', express.static(path.join(__dirname, 'node_modules/@signalwire/js/dist'), { index: false }));

    app.use('/', createPageRouter(options.page));
    app.use('/', createTokenRouter(options.token));

    app.use((req, res) => res.status(404).json({ error: 'Not found' }));
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        console.error(err);
        res.status(err.status || 500).json({ error: err.expose ? err.message : 'Internal server error' });
    });

    return app;
}

if (require.main === module) {
    require('dotenv').config();
    const host = process.env.HOST || '127.0.0.1';
    const port = Number(process.env.PORT) || 8080;
    createApp().listen(port, host, () => {
        console.log(`Server listening on http://${host}:${port}`);
    });
}

module.exports = { createApp };
