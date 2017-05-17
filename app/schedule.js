var helpers = require('./helpers');
var schedule = require('node-schedule');
var routes = require('./routes');
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

  var checkForErrorsJob = schedule.scheduleJob({
    hour: 8,
    minute: 30,
    dayOfWeek: [1, 2, 3, 4, 5]
  }, updateCompletedOrders);

  // prepare scheduler
  var getOrdersJob = schedule.scheduleJob({
    hour: 7,
    minute: 45,
    dayOfWeek: [1, 2, 3, 4, 5]
  }, getOrders);
}