# Init

The app's .env file must have the following defined:

- BASEPATH location of the app

# Cron

fundamen implements an easy to use method for javascript files to run in a cron-like fashion for the following files

    ./cron/*.js

## Parameters

Each file should return an export with the following format

|parameter|type|description|
|---------|---|:---|
|exec     |function|The function that will be executed multiple times with span intervals
|init     |function|The function that will be executed only once when the application starts|
|timespan |integer |The modulus timespan in seconds to execute the exec function.  For example, every 5 minutes would be 900, once an hour 3600|
|offset   |integer |The offset to apply to _span_.  For example, if you'd like a cron to run once a day at noon, use a _span_ of 86400 and an offset of _-43200_|

## Starting

It is recommended to start the application's cronjobs seperate from www, and this can be done with the following:

    node ./bin/cron.js

If you'd like to debug a specific cronjob:

    node ./bin/cron.js filename

# www

The whole point of fundamen was to abstract many of the things needed to be done with express and just allow one to start writing code.

The following .env variables will affect fundamen

*REQUIRED*


- PORT the port to listen on

*Optional*

- WEBSOCKET_LOAD whether or not to load the websocket, defaults to false
- WEBSOCKET_PORT the port to listen to for the websocket, defaults to 18888
- ENABLE_ETAG false  allows incoming requests to provide etag value for caching
- HTTP_COOKIE_SECRET _none_
- HTTP_COOKIE_SECURE 'test'
- HTTP_COOKIE_HTTPONLY true
- HTTP_COOKIE_SAMESITE 'strict'
- HTTP_COOKIE_TIMEOUT_SECONDS 0 

- http_caching_enabled, defaults to false, if enabled will utilize redis for caching GET requests only
- http_logging false, whether or not to emit log events for web requests 
- www_public - the directory where public files will be located, defaults to BASEPATH/www/public/

*Utility* 

- env2res  Comma delimited list of keys who's values will be passed to pug renders directly

Example:

    env2res=copyrightyear,googleauth
    copyrightyear=2025
    googleauth=AE8000EA

There is a value that will always be present, server_started, and that is the Date.now() value for when the server was... started.  This is useful in instances such as the following (pug):

    link(rel="stylesheet" href="/css/app.css?v=" + server_started)


## www

fundamen will load \*.js files in the www/controllers directory and route them with the following format:

    {
        paths: string, [string1, string2, etc...],
        method: function,
        priority: integer (defaults 0),
    }

- The path to listen to, example, /
- The following methods are valid: connect, delete, get, head, options, patch, post, put, trace
- the function to execute for this path and method
- the function will be executed and passed the following parameters app, req, and res

The callback is expected to be an object that can contain the following parameters:

    {
        content_type: string,
        ttl: integer > 0,
        cors: sets 'Access-Control-Allow-Origin' to this value,
        status_code: integer > 0,
        redirect: a redirect url, uses status_code 302 unless specified otherwise
        json: returns the given json object
        view: compiles and returns the result using the given pug file
        package: an object that contains the package to send, may be error prone if you have not set res manually
    }

- Any requests that have /api/ in the url will always be given cors

## websocket

The websocket can be accessed using app.websocket
