'use strict';

const controllers = require('./server/controllers');
const routes = require('./server/routes');
const services = require('./server/services');

module.exports = {
  controllers,
  routes,
  services,
  register(/* { strapi } */) {
    // registeration phase
  },
  bootstrap(/* { strapi } */) {
    // bootstrap phase
  },
};