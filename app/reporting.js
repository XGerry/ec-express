var cart3d = require('./3dcart');
var helpers = require('./helpers');
var moment = require('moment');
var rp = require('request-promise-native');

function getOrderReport(startDate, endDate, statusArray) {
  var promises = [];
  var query = {
    countonly: 1,
    datestart: startDate.format('MM/DD/YYYY H:mm:ss'),
    dateend: endDate.format('MM/DD/YYYY H:mm:ss')
  };

  statusArray.forEach(status => {
  	query.orderstatus = status;
  	promises.push(cart3d.loadOrders(query, true));
  	promises.push(cart3d.loadOrders(query, false));
  	console.log(query);
  });

  return Promise.all(promises);
}

module.exports = {
	getOrderReport: getOrderReport
}