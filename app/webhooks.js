var request = require('request');
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json({limit : '50mb'});
var Order = require('./model/order');
var Customer = require('./model/customer');
var Item = require('./model/item');
var helpers = require('./helpers');
var Settings = require('./model/settings');

function updateOrderInfo(order, cartOrder) {
  order.name = cartOrder.BillingFirstName + ' ' + cartOrder.BillingLastName;
  order.cartOrder = cartOrder;
  order.canadian = cartOrder.InvoiceNumberPrefix == 'CA-';
  var itemList = [];
  if (cartOrder.OrderItemList) {
    cartOrder.OrderItemList.forEach(function(item) {
      // TODO
      var sku = item.ItemID.trim();
      var findingItem = Item.findOne({sku: sku});
      findingItem.then(function(doc) {
      	if (doc) {
        	doc.lastOrderDate = new Date(cartOrder.OrderDate);
        	doc.save();
      	}
      });
    });
  }	
  
  order.save(function(err, savedOrder) {
    updateCustomerInfo(savedOrder, cartOrder);
  });
}

function updateCustomerInfo(order, cartOrder) {
  var email = cartOrder.BillingEmail;
  Customer.findOne({email: email}, function(err, customer) {
    if (err) {
      console.log(err);
    } else {
      if (customer) {
        updateCustomer(customer, order, cartOrder);
      } else {
        var newCustomer = new Customer();
        newCustomer.email = email;
        updateCustomer(newCustomer, order, cartOrder);
      }
    }
  });
}

function updateCustomer(customer, order, cartOrder) {
  customer.firstname = cartOrder.BillingFirstName;
  customer.lastname = cartOrder.BillingLastName;
  customer.lastOrderDate = new Date(cartOrder.OrderDate);
  customer.orders.push(order._id);
  customer.save();
}

function orderBot(body) {
	var options = {
		url: 'https://hooks.slack.com/services/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',
		method: 'POST',
		json: true,
		body: body
	};
	request(options);
}

function sendOrderToSlack(order) {
	var canadian = order.InvoiceNumberPrefix == 'CA-';
	var orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
	var infoURL = 'https://www.ecstasycrafts.' + (canadian ? 'ca' : 'com') + '/admin/order_details.asp?orderid=' + order.OrderID;
	var message = order.BillingFirstName + ' ' + order.BillingLastName;
	message += ' placed an order for $' + order.OrderAmount.toFixed(2) + '.';
	message += ' <'+infoURL+'|'+orderId+'>';

	orderBot({ text: message });
}

function sendCustomerToSlack(customer) {
	var message = customer.BillingFirstName + ' ' + customer.BillingLastName + ' is a new customer.';

	var options = {
		url: 'https://hooks.slack.com/services/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',
		method: 'POST',
		json: true,
		body: {
			text: message
		}
	};

	request(options);
}

function sendNewProductToSlack(product) {
	var message = 'New item ' + product.SKUInfo.SKU + ' added.';
	var options = {
		url: 'https://hooks.slack.com/services/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',
		method: 'POST',
		json: true,
		body: {
			text: message
		}
	};

	request(options);
}

module.exports = {
	route: function(app, qbws) {
		app.post('/webhooks/new-order', jsonParser, function(req, res) {
			var orders = req.body;
			helpers.setTimeCode();
			var timecode = helpers.getTimeCode();
			var findSettings = Settings.findOne({});
			findSettings.then(function(settings) {
				settings.timecodes.push(timecode);
				settings.save();

				orders.forEach((order) => {
			    var orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
					var newOrder = new Order();
					newOrder.imported = false;
					newOrder.orderId = orderId;
					newOrder.timecode = timecode;
					updateOrderInfo(newOrder, order);
					sendOrderToSlack(order);
					qbws.emptyQueue();
					helpers.createInvoices(qbws);
					qbws.setFinalCallback(function() {
						helpers.markCompletedOrdersAsProcessing(settings.timecodes, function(err, results) {
							// send import report to slack.
							orderBot({text: results.length + ' orders were successfully imported and moved to processing.'});

							// clear the timecodes from settings
							var savedSettings = findSettings.then(function(settings) {
								settings.lastImports = settings.timecodes;
								settings.timecodes = [];
								return settings.save();
							});

							savedSettings.then((settings) => {
								var orderReport = helpers.getOrderReport(settings);
								orderReport.then((report) => {
									orderBot(helpers.getSlackOrderReport(report));
									settings.lastImports = [];
									settings.save();
									Order.remove({imported: true});
								});
							});
						});
					});
				});
			});


			res.send('New order.');
		});

		app.post('/webhooks/new-customer', jsonParser, function(req, res) {
			var customers = req.body;
			customers.forEach((customer) => {
				sendCustomerToSlack(customer);
			});

			res.send('New customer.');
		});

		app.post('/webhooks/new-product', jsonParser, function(req, res) {
			var products = req.body;
			products.forEach((product) => {
				sendNewProductToSlack(product)
			});

			res.send('New product.');
		});
	},
	orderBot: orderBot
}

