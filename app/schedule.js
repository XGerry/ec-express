var helpers = require('./helpers');
var schedule = require('node-schedule');
var routes = require('./routes');
var cart3d = require('./3dcart');
var Order = require('./model/order.js');

module.exports = function(qbws) {
  function getOrders() {
    var options = {
      limit : 200,
      orderstatus : 1, // New
    };
    console.log('Automatically grabbing the orders from 3D Cart.');
    routes.getOrders(options, qbws, function(responseObject) {
      // then automatically mark these orders as processing
      console.log(responseObject);
    });
  }

  function updateCompletedOrders() {
    console.log('Automatically updating the orders in 3D Cart to processing.');
    helpers.markCompletedOrdersAsProcessing(function(err, response, body) {
      console.log('marked orders as processing');
      console.log(response);
    });
  }

  /**
   * this should run once every couple hours
   */
  function refreshInventory(callback) {
    cart3d.refreshFrom3DCart(callback);
  }
  
}