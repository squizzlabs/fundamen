'use strict';

module.exports = async function (jobType, options = {}) {
	let app;
	switch(jobType) {
		case 'www':
			app = await require('./bin/init.js')();
			require('./bin/www.js')(app);
			return app;
		case 'cron':
			app = await require('./bin/init.js')();
			require('./bin/cron.js')(app, options);
			return app;
		case 'prepare':
			prepareApplication();
			break;
		case '?':
		case 'help':
		case '--h':
		default:
			console.error('Unknown job type', jobType);
			console.error('Valid job types are www, cron, prepare'); 
			console.error('   cron - Starts cron jobs, requires basepath to be defined, redis enabled, and a cron directory');
			console.error('    www - Starts an express server, requires port to be defined')
			console.error('prepare - Prepares the directory with the basics for cron and www with examples files')
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

function prepareApplication() {
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
