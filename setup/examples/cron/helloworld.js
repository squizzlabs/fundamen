'use strict';

async function f(app) {
	console.log('Hello World! The time is', new Date());
}

module.exports = {
    exec: f,
    span: 60
}