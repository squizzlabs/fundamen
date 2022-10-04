#!/usr/bin/env node

const fs = require('fs');
let outer_app;

module.exports=init;

let initialized = false;
function init(app, options = {}) {
    outer_app = app;
    app.watch(['.env', 'cron', 'util', 'bin'], restart);

    if (typeof options.cron == 'string') {
        let task = require(process.env.BASEPATH + '/cron/' + options.cron);
        task.exec(app);
    }
    else if (initialized == false) {
        initialized = true;
        clearRunKeys(app);
    }
}

async function clearRunKeys(app) {
    let tasks = loadTasks(app);

    await app.redis.del("STOP");
    await app.redis.del("RESTART");

    let runkeys = await app.redis.keys('crin:running*');
    for (let i = 0; i < runkeys.length; i++) {
        await app.redis.del(runkeys[i]);
    }
    setTimeout(runTasks.bind(null, app, tasks), 1);
}

function loadTasks(app) {
    const cron_path = process.env.BASEPATH + '/cron/';
    if (!fs.existsSync(cron_path)) {
        console.error("No cron directory");
        process.exit(2);
    }
    console.log('Looking for cron files within ' + cron_path);

    let tasks = {};
    fs.readdirSync(cron_path).forEach(file => {
        if (file.substr(-3) != '.js') return;
        let file_path = process.env.BASEPATH + '/cron/' + file;
        let cron = require(file_path);
        let task = createTaskSettings(cron);

        if (typeof task.exec != 'function') return;
        if ((task.span || 0) <= 0) return;

        let cron_about = 'Loaded ' + file + ' to execute every ' + task.span + ' second interval';
        if (task.offset != 0) cron_about += ' with an offset of ' + task.offset + ' seconds';
        tasks[file] = task;
        console.log(cron_about);
    });

    return tasks;
}

function createTaskSettings(params) {
    return {
        exec: params.exec,
        span: params.span || 1,
        iterations: params.iterations || 0,
        offset: params.offset || 0
    };
}

async function runTasks(app, tasks) {
    try {
        if (await app.redis.get("STOP") != null || await app.redis.get("RESTART") != null) {
            console.log("STOPPING");
            app.bailout = true;
            iterations = 15;
            while (iterations > 0 && (await app.redis.keys("crin:running:*")).length > 0) {
                console.log('Running: ', await app.redis.keys("crin:running:*"));
                await app.sleep(1000);
                iterations--;
            }
            if (await app.redis.keys("crin:running:*").length > 0) {
                for (let i = iterations; i > 0; i--) {
                    console.log(i);
                    await app.sleep(1000);
                }
            }
            if (await app.redis.get("RESTART") != null) {
                await app.redis.del("RESTART");
                console.log("Restarting...");
                await app.sleep(1000);
                process.exit(0);
            }
            console.log("STOPPED");
            await app.sleep(1000);
            process.exit(0);
        }

        let now = app.now();

        let arr = Object.keys(tasks);
        for (let i = 0; i < arr.length; i++) {
            let task = arr[i];
            let taskConfig = tasks[task] || {};
            let currentSpan = now - (now % (taskConfig.span || 1)) + (taskConfig.offset || 0);
            let iterations = taskConfig.iterations || 1;

            for (let j = 0; j < iterations; j++) {
                let curKey = 'crin:current:' + j + ':' + task + ':' + currentSpan;
                let runKey = 'crin:running:' + j + ':' + task;

                if (await app.redis.get(curKey) != 'true' && await app.redis.get(runKey) != 'true') {
                    await app.redis.setex(curKey, taskConfig.span || 3600, 'true');
                    await app.redis.setex(runKey, 3600, 'true');

                    f = taskConfig.exec;
                    runTask(task, f, app, curKey, runKey, j);
                }
            }
        }
    } finally {
        await app.sleep(Math.max(1, 1 + (Date.now() % 1000)));
        if (!app.bailout) setTimeout(runTasks.bind(null, app, tasks), 1);
    }
}

async function runTask(task, f, app, curKey, runKey, iteration) {
    try {
        await f(app, iteration);
    } catch (e) {
        console.log(task + ' failure:');
        console.log(e);
        await app.redis.del(curKey);
        await app.redis.del(runKey);
    } finally {
        await app.redis.del(runKey);
        if (app.bailout == true) await app.redis.del(curKey); // Bailed, probably didn't get to finish
    }
}

async function debug(task) {
    app = await getApp();
    app.debug = true;
    console.log('Debugging ' + task);
    let f = require('../cron/' + process.argv[2]);
    await runTask(process.argv[2], f, app, '0', '0');
    console.log("Debug finished");
}

async function restart(evt, name) {
    await outer_app.redis.set("RESTART", "true");
}
