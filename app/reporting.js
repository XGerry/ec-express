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
  });

  return Promise.all(promises);
}

function getUnpaidOrders(startDate, endDate, cb) {
  console.log('getting all the shipped orders');
  var options = {
    orderstatus: 4, // shipped
    countonly: 1,
    datestart: startDate,
    dateend: endDate
  };

  return cart3d.loadOrders(options, false).then(async orderInfo => {
    console.log(orderInfo);
    var batchSize = 10;
    var numOfRequests = Math.ceil(orderInfo.TotalCount / batchSize);
    for (var i = 0; i < numOfRequests; i++) {
      const orders = await cart3d.loadOrders({
        orderstatus: 4,
        limit: batchSize,
        datestart: startDate,
        dateend: endDate,
        offset: i * batchSize
      });

      const unpaid = orders.filter(order => {
        var isUnpaid = order.TransactionList.length == 1 && order.BillingOnLinePayment == true;
        return isUnpaid;
      });

      console.log(unpaid.length);
      console.log(((i + 1) / numOfRequests) * 100);
      cb(unpaid, ((i + 1) / numOfRequests) * 100);
    }
    return 'Done';
  });
}

module.exports = {
	getOrderReport: getOrderReport,
  getUnpaidOrders: getUnpaidOrders
}
