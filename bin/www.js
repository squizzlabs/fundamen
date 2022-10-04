'use strict';

let express = require('express');
let fs = require('fs');
let path = require('path');
let debug = require('debug')('server');
let http = require('http');
let morgan = require('morgan');
let watch = require('node-watch');
let bodyParser = require('body-parser');
let expressSession = require('express-session');
let RedisStore = require("connect-redis")(expressSession);

let server;

const server_started = Date.now();

module.exports = init;

let initialized = false;
function init(app) {
    if (initialized == false) {
        initialized = true;
        startWebListener(app);
    }
}

async function startWebListener(app) {
    app.watch(['.env', 'www', 'util', 'bin'], close.bind(null, app));

    let www = express();

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
            console.log('Porting', key, value, 'for use by res');
        }
    }

    app.server_started = server_started;
    if (process.env.HTTP_COOKIE_SECRET != undefined) {
        let cookie = {maxAge: ((process.env.HTTP_COOKIE_TIMEOUT_SECONDS | 0) * 1000)}
        let env = (process.env.env == undefined ? '' : process.env.env).toLowerCase();
        if (process.env.env == 'prod' || process.env.env == 'production') cookie.secure = true; // https
        www.use(expressSession({
            store: new RedisStore({ client: require("redis").createClient() }),
            secret: process.env.HTTP_COOKIE_SECRET,
            cookie: cookie,
            resave: false,
            rolling: true,
            saveUninitialized: false
        }));
    }
    www.use((req, res, next) => {
        res.locals.server_started = server_started;
        res.locals.app = www.app;
        res.locals.env = env;
        next();
    });
    www.use(bodyParser.json());
    www.use(bodyParser.urlencoded({ extended: true }));

    if (process.env.http_logging != 'false') www.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

    www.disable('x-powered-by');
    www.use('/api/', require('cors')());

    www.use('/', express.static(process.env.BASEPATH + '/www/public'));
    www.use('/', require('../www/routes.js'));

    www.app = app;
    app.express = www;

    server = http.createServer(www);
    server.listen(process.env.PORT);
    server.timeout = 3600000;
    server.on('error', onError);
    server.on('listening', onListening);

    console.log('Listening on port ' + process.env.PORT);

    if (process.env.WEBSOCKET_LOAD == 'true') app.websocket = require(__dirname + '/websocket'); // Start the websocket
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

async function close(app) {
    if (server) await server.close();
    if (app.websocket) await app.websocket.unmount();
    process.exit();
}