'use strict'; 

const pug = require('pug');
const fs = require('fs');
const path = require('path');
let express = require('express');
let router = express.Router({
    strict: true
});
module.exports = router;

const http_caching_enabled = (process.env.http_caching_enabled | true);
const http_methods = ['connect', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'];
const compiled = {};
const in_progress = {};
const routes = {};

try {
    const controller_path = process.env.BASEPATH + '/www/controllers';
    if (checkFor(controller_path)) {
        const controllers = {};
        loadControllers(process.env.BASEPATH + '/www/controllers', controllers);
        addControllers(controllers);
    } else {
        console.error('No controller path:', controller_path);
    }
} catch (e) {
    console.log(e);
}

function loadControllers(file_path, controllers) {
    console.log('Controller searching within', file_path)
    fs.readdirSync(file_path).forEach(file => {
        var full_path = file_path + '/' + file;
        if (fs.lstatSync(full_path).isDirectory()) {
            loadControllers(full_path, controllers);
        } else if (path.extname(file) == ".js") {
            let controller = require(full_path);
            let priority = controller.priority || 0;
            if (!Array.isArray(controllers[priority])) controllers[priority] = [];
            controller.file = file;
            controllers[priority].push(controller);
        }
    });
}

function addControllers(prioritized_controllers) {
    for (let priority of Object.keys(prioritized_controllers)) {
        let controllers = prioritized_controllers[priority];
        for (let controller of controllers) {
            if (!Array.isArray(controller.paths)) controller.paths = [controller.paths];
            for (const method of http_methods) {
                if (typeof controller[method] == 'function') {
                    for (let controllerPath of controller.paths) {
                        if (controller[method]) addRoute(method, controllerPath, controller, controller.file);
                        console.log('Adding', method.toUpperCase(), 'route for', controller.file, 'at', controllerPath);
                    }
                }
            }
        }
    }
}

async function doStuff(req, res, next, controller) {
    const app = req.app.app;
    req.verify_query_params = verify_query_params;

    const lowered = req.method.toLowerCase();
    const send_package = lowered != 'head';
    const method = (lowered == 'head' ? 'get' : lowered);
    let cache_key = 'zkb:http_cache:' + method + ':' + req.originalUrl;

    try {
        if (in_progress[cache_key] == undefined) in_progress[cache_key] = getResult(app, controller, req, res, method, cache_key);
        let result = await in_progress[cache_key];

        if (result.content_type != undefined) res.setHeader("Content-Type", result.content_type);
        if (result.status_code != undefined) res.sendStatus(result.status_code);
        if (result.ttl > 0) res.set('Cache-Control', 'public, max-age=' + result.ttl);

        if (result.redirect) res.redirect(result.redirect);
        else if (result.json !== undefined) res.json(result.json);
        else if (result.view !== undefined) {
            if (compiled[result.view] == null) {
                compiled[result.view] = pug.compileFile(process.env.BASEPATH + '/www/views/' + result.view);
            }
            let o = {};
            Object.assign(o, res.locals);
            Object.assign(o, result.package);

            let render = compiled[result.view];
            let rendered = render(o, {
                debug: true,
                cache: false,
            });

            if (send_package) res.send(rendered);
        } else if (send_package && result.package) res.send(result.package);
    } catch (e) {
        console.log('error in fundamen route.js', e);
    } finally {
        await in_progress[cache_key]; // ensure the promise has finished 
        delete in_progress[cache_key];
    }
}

async function getResult(app, controller, req, res, method, cache_key) {
    let result = (http_caching_enabled ? await app.redis.get(cache_key) : undefined);

    if (result) { // something was cached!
        result = JSON.parse(result);
    } else {
        const controller_result = controller[method](req, res);
        if (typeof controller_result != 'object') throw 'Invalid result from controller' + controller.file + typeof controller_result + controller_result;

        const promise = app.wrap_promise(controller_result);
        /*const timeout = app.sleep(process.env.HTTP_TIMEOUT || 60000);

        await Promise.race([promise, timeout]); 
        if (promise.isFinished() == false) return res.sendStatus(408); // timed out*/
    
        result = await promise;
        if (result === undefined || result === null) throw 'Invalid null/undefined result from ' + controller.file;
        else if (http_caching_enabled && (result.ttl | 0) > 0) await app.redis.setex(cache_key, result.ttl, JSON.stringify(result));
    }

    return result;
}

function addRoute(routeType, route, controller) {
    if (routes[routeType] == null) routes[routeType] = [];
    if (routes[routeType].includes(route)) {
        console.error('CONFLICT:', routeType, route, 'has already been mapped! Ignoring...');
        return;
    }
    const ret = router[routeType](route, (req, res, next) => {
        doStuff(req, res, next, controller);
    });
    routes[routeType].push(route);
}

function verify_query_params(req, valid_array) {
    let base_url = (req.alternativeUrl != undefined ? req.alternativeUrl : req._parsedUrl.pathname);
    let query_params = req.query;

    let required = valid_array.required || [];
    delete valid_array.required;
    let valid_keys = Object.keys(valid_array);
    let given_keys = Object.keys(query_params);

    // Ensure we have the base correct
    if (base_url != req._parsedUrl.pathname) {
        return rebuild_query(base_url, query_params, valid_array, required);
    }

    // Make sure all required fields are present
    for (const req_parameter of required) {
        if (query_params[req_parameter] === undefined || query_params[req_parameter].length == 0) return rebuild_query(base_url, query_params, valid_array, required);
    }

    let last_key = '';
    let rebuild_required = false;
    for (const key of given_keys) {
        if (key <= last_key) rebuild_required = true;

        // Verify any unsupported parameters are not present
        if (valid_keys.indexOf(key) === -1) {
            rebuild_required = true;; // This key does not belong here
        }

        // Make sure its not just an empty value
        if (query_params[key].length == 0) {
            return null; // Just 404 in this case, don't attempt rebuild
        }

        // Verify params are mapped to proper types
        switch (valid_array[key]) {
        case 'string':
            // already checked for non-empty value, we're good, move on
            break;
        case 'integer':
            let num = Number.parseInt(query_params[key]);
            if (isNaN(num)) return null; // Just 404 in this case, don't attempt rebuild
            break;
        default:
            // If the data type passed is an array, then we need to make sure our value is within that array
            if (Array.isArray(valid_array[key])) {
                if (req.query[key].indexOf(query_params[key]) == -1) rebuild_required = true;
            } else {
                // matching value provided, make sure we have that value
                if (query_params[key] != ('' + valid_array[key])) rebuild_required = true; // This key does not belong here;
            }
        }

        last_key = key;
    }
    if (rebuild_required) {
         return rebuild_query(base_url, query_params, valid_array, required);
    }

    return true;
}

function rebuild_query(base_url, query_params, valid_array, required) {
    let rebuild = {};
    for (const key of required) {
        switch (valid_array[key]) {
        case 'integer':
            rebuild[key] = (query_params[key] || 0);
            break;
        case 'string':
            rebuild[key] = query_params[key];
            break;
        default:
            if (Array.isArray(valid_array[key])) {
                rebuild[key] = valid_array[key][0]; // first value is default
            } else {
                rebuild[key] = valid_array[key];
            }
        }
        delete query_params[key];
        delete valid_array[key];
    }

    // Iterate the remaining keys
    let valid_keys = Object.keys(valid_array);
    let given_keys = Object.keys(query_params);
    for (const key of valid_keys) {
        if (query_params[key] == undefined) continue;

        switch (valid_array[key]) {
        case 'integer':
            rebuild[key] = (query_params[key] || 0);
            break;
        case 'string':
            rebuild[key] = query_params[key];
            break;
        default:
            rebuild[key] = valid_array[key];
        }
    }

    let keys = Object.keys(rebuild).sort();
    let url = base_url;
    let first = true;
    let added = false;
    for (const key of keys) {
        if (first) url += '?';
        first = false;
        if (added) url += '&';
        added = true;
        url += (key + '=' + rebuild[key]);
    }
    return url;
}

function checkFor(directory) {
    if (!fs.existsSync(directory)) {
        console.error(directory + ' does not exist!')
        return false;
    }
    return true;
}
