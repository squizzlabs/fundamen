'use strict';

module.exports = {
   paths: '/',

   get: async function(req, res) {
      return {
          package: {now: new Date()},
          ttl: 5,
          view: 'helloworld.pug'
      };
   }
}