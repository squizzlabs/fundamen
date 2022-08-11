module.exports = startApp;

require('dotenv').config();

const fs = require('fs');
const util = require('util');
const Database = require('../classes/Database.js');

async function startApp() {
    const app = {};

    if (process.env.BASEPATH == undefined) {
        process.env.BASEPATH = process.cwd();
        console.log('Determining basepath to be', process.env.BASEPATH);
    }

    app.log = function(object) {
        console.log(util.inspect(object, false, null, true /* enable colors */));
    }

    app.md5 = require('md5');

    app.waitfor = async function (promises) {
        for (let i = 0; i < promises.length; i++) {
            await promises[i];
        }
    }

    app.sleep = function sleep(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms)
        });
    }

    app.restart = function () {
        setTimeout(function() { process.exit(); }, 3000);
    }

    app.randomSleep = async function(min, max = -1) {
        min = Math.abs(min);
        if (max == -1) {
            min = 0;
            max = min;
        } else if (max < min) {
            throw 'max cannot be greather than min ' + min + ' ' + max;
        }

        let base = min;
        let diff = max - min;
        let random = Math.floor(Math.random() * diff);

        await app.sleep(base + random);
    }

    app.now = function(mod = 0) {
        let now = Math.floor(Date.now() / 1000);
        if (mod != 0) now = now - (now % mod);
        return now;
    }


    app.phin = require('phin').defaults({
        'method': 'get',
        'headers': {
            'User-Agent': process.env.USER_AGENT
        }
    });
    app.fetch = async function (url, parser, failure, options) {
        try {
            return await parser(app, await phin(url), options);
        } catch (e) {
            return failure(app, e);
        }
    };
    console.log('loaded Phin...');

    if (process.env.MONGO_LOAD == 'true') {
        const MongoClient = require('mongodb').MongoClient;
        const url = process.env.MONGO_URL;
        const dbName = process.env.MONGO_DB_NAME;
        const client = new MongoClient(url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            connectTimeoutMS: 3600000,
            socketTimeoutMS: 3600000,
        });

        try {
            await client.connect();
        } catch (e) {
            // server not up? wait 15 seconds and exit, let the daemon restart us
            await app.sleep(15000);
            process.exit();
        }
        app.db = client.db(dbName);
        let collections = await app.db.listCollections().toArray();
        for (let i = 0; i < collections.length; i++) {
            console.log('Prepping ' + collections[i].name);
            app.db[collections[i].name] = app.db.collection(collections[i].name);
        }
        console.log('loaded MongoDB...');
    }

    if (process.env.MYSQL_LOAD == 'true') {
        let mysql = new Database({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DB
        });
        app.mysql = mysql;
        console.log('loaded MySQL...');
    }

    if (process.env.REDIS_LOAD == 'true') {
        app.redis = require('async-redis').createClient({
            retry_strategy: redis_retry_strategy
        });
        console.log('loaded Redis...');
    }

    // Check for utils
    const util_dir = process.env.BASEPATH + '/util/';
    if (fs.existsSync(util_dir)) {
        console.log('Checking /util/');
        app.util = {};
        fs.readdirSync(util_dir).forEach(file => {            
            let util_base = file.substr(0, file.length - 3);
            let util_path = process.env.BASEPATH + '/util/' + file;
            let util = require(util_path);
            if (typeof util == 'function') util(app);
            app.util[util_base] = util;

            console.log('Loaded util', file);
        });
    }

    console.log('fundamen initialized...');

    return app;
}

function redis_retry_strategy(options) {
    if (options.error && options.error.code === 'ECONNREFUSED') {
        // End reconnecting on a specific error and flush all commands with
        // a individual error
        return new Error('The server refused the connection');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
        // End reconnecting after a specific timeout and flush all commands
        // with a individual error
        return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
        // End reconnecting with built in error
        return undefined;
    }
    // reconnect after
    return Math.min(options.attempt * 100, 3000);
}