"use strict";

const port = (process.env.WEBSOCKET_PORT || 18888);
const http = require("http").createServer((req, res) => { res.writeHead(404); res.end(); }).listen(port);
const ws = new (require("websocket").server)({ httpServer: http, autoAcceptConnections: true });

module.exports = ws;

console.log(`Websocket Server started and listening on port ${port}`);