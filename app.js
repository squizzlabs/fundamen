'use strict';

module.exports = function (jobType) {
	switch(jobType) {
		case 'www':
			return require('./bin/www.js');
		case 'cron':
			return require('./bin/cron.js');

		case 'init':
			initApp();
			break;
		default:
			console.error('Unknown job type', jobType);
			console.error('Valid job types are www, cron, init'); 
	}
}

const touch_directories = [
	'www',
	'www/controllers',
	'www/views',
	'www/public',
	'www/public/js',
	'www/public/css',
	'cron'
];
const touch_files = [
	'www/public/js/app.js',
	'www/public/css/app.css',
];
const copy_files = {
	'node_modules/fundamen/setup/env': '.env',
	'node_modules/fundamen/setup/examples/cron/helloworld.js': 'cron/helloworld.js',
	'node_modules/fundamen/setup/examples/www/helloworld.js': 'www/controllers/helloworld.js',
	'node_modules/fundamen/setup/examples/www/helloworld.pug': 'www/views/helloworld.pug',
}

function initApp() {
	const fs = require('fs');
	for (const dir of touch_directories) {
		if (!fs.existsSync(dir)) {
			console.log('Creating dir', dir);
			fs.mkdirSync(dir);
		}
	}

	for (const file of touch_files) {
		if (!fs.existsSync(file)) {
			console.log('Creating file', file);
			fs.closeSync(fs.openSync(file, 'w'));
		}
	}

	for (const [source, dest] of Object.entries(copy_files)) {
		if (!fs.existsSync(dest)) {
			console.log('Copying', dest);
			fs.copyFileSync(source, dest);
		}
	}

	// Create the cron directory
}
