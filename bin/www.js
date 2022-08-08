'use strict';

let express = require('express');
let path = require('path');
let debug = require('debug')('server');
let http = require('http');
let morgan = require('morgan');
let watch = require('node-watch');

let app = undefined;
let server;

async function getApp() {
    if (app === undefined) {
        let req = require('./init.js');
        app = await req();
    }
    return app;
}

const server_started = Date.now();

startWebListener();

async function startWebListener() {
    let www = express();

    www.app = await getApp();

    www.root = process.env.BASEPATH;

    www.set('views', www.root + 'www/views');
    www.set('view engine', 'pug');

    if (process.env.ENABLE_ETAG == 'true') www.enable('etag');

    const env = {};
    if (process.env.env2res !== undefined) {
        const keys = process.env.env2res.split(',');
        for (const key of keys) {
            const value = process.env[key];
            env[key] = value;
        }
    }
    
    www.use((req, res, next) => {
        res.locals.server_started = server_started;
        res.locals.app = www.app;
        res.locals.env = env;
        next();
    });

    www.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

    www.disable('x-powered-by');
    www.use('/api/', require('cors')());

    www.use('/', express.static(process.env.BASEPATH + '/www/public'));
    let indexRouter = require('../www/routes.js');
    www.use('/', indexRouter);

    server = http.createServer(www);
    server.listen(process.env.PORT);
    server.timeout = 3600000;
    server.on('error', onError);
    server.on('listening', onListening);

    console.log('Listening on port ' + process.env.PORT);

    watch('www/', {recursive: true}, app.restart);
    watch('.env', {recursive: true}, app.restart);
}

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    let bind = typeof process.env.PORT === 'string' ?
        'Pipe ' + process.env.PORT :
        'Port ' + process.env.PORT;
    // handle specific listen errors with friendly messages
    switch (error.code) {
    case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
    case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
    default:
        throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
    let addr = server.address();
    let bind = typeof addr === 'string' ?
        'pipe ' + addr :
        'port ' + addr.port;
    debug('Listening on ' + bind);
}
