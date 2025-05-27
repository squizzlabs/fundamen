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
    if(app.watch) app.watch(['.env', 'www', 'util', 'bin'], close.bind(null, app));

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
        let cookie = {
            secure: !(process.env.HTTP_COOKIE_SECURE == 'false'),
            httpOnly: process.env.HTTP_COOKIE_HTTPONLY == 'true', 
            sameSite: process.env.HTTP_COOKIE_SAMESITE || 'None', 
            maxAge: ((process.env.HTTP_COOKIE_TIMEOUT_SECONDS || 0) * 1000)
        }
        www.use(expressSession({
            store: new RedisStore({ client: require("redis").createClient() }),
            secret: process.env.HTTP_COOKIE_SECRET,
            cookie: cookie,
            resave: process.env.HTTP_COOKIE_RESAVE == 'true',
            rolling: process.env.HTTP_COOKIE_ROLLING == 'true',
            saveUninitialized: process.env.HTTP_COOKIE_SAVEUNINITIALIZED == 'true'
        }));
    }
    www.use((req, res, next) => {
        res.locals.server_started = server_started;
        res.locals.app = www.app;
        res.locals.env = env;
        next();
    });
    www.use(bodyParser.urlencoded({ extended: true }));
    www.use(bodyParser.json());

    if (process.env.http_logging != 'false') www.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

    www.disable('x-powered-by');
    www.use('/api/', require('cors')());

    if (fs.existsSync(process.env.BASEPATH + '/www/public/')) {
        console.log("using public directory www/public/");
        www.use('/', express.static(process.env.BASEPATH + '/www/public'));
    }
    if (fs.existsSync(process.env.www_public)) {
        console.log("using public directory " + process.env.www_public);
        www.use('/', express.static(process.env.www_public));
    }
    www.use('/', require('../www/routes.js'));

    www.app = app;
    app.express = www;

    server = http.createServer(www);
    if (process.env.PORT == undefined) {
        console.error("PORT for www listening not defined within env");
        process.exit(1);
    }
    server.listen(process.env.PORT);
    server.timeout = 3600000;
    server.on('error', onError);
    server.on('listening', onListening);

    console.log('Listening on port ' + process.env.PORT);

    if (process.env.WEBSOCKET_LOAD == 'true') {
        const WebSocket = require('ws');
        app.websocket = new WebSocket.Server({ server, path: process.env.WEBSOCKET_URL });
        console.log('wss enabled');
    }
    //require(__dirname + '/websocket'); // Start the websocket
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
