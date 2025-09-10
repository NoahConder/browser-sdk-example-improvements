// Imports
const express = require('express');
const path = require('path');
const tokenHandler = require('./public/handlers/token_handler');
const verto = require('./public/routes/verto_call');


const app = express();

function configureExpress() {
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    app.use(express.json());
    app.use(express.urlencoded({extended: false}));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));
}

function installRoutes() {
    app.use('/', verto);
    app.use('/', tokenHandler);

}

function startServer() {
    app.listen(8080, "0.0.0.0");
    console.log("Server is hosted at: http://127.0.0.1:8080");
}

configureExpress();
installRoutes();
startServer();
