var request = require('request');
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json({limit : '50mb'});
var formParser = bodyParser.urlencoded({limit : '50mb'});
var Order = require('./model/order');
var Customer = require('./model/customer');
var Item = require('./model/item');
var helpers = require('./helpers');
var Settings = require('./model/settings');
var mailer = require('./mailer');

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
  
  return order.save();
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
	if (order.BillingCompany != '') {
		message += ' - ' + order.BillingCompany + ' (Wholesale)';
	}

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

function customerSupportBot(payload) {
	var options = {
		url: 'https://hooks.slack.com/services/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',
		method: 'POST',
		json: true,
		body: payload
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

function packageSupportRequest(supportRequest) {
	var text = 'New support request from ' + supportRequest.firstName + ' ' + supportRequest.lastName + '.';
	var body = {
		attachments: [{
			fallback: text,
			pretext: text,
			fields: [{
				title: 'Subject',
				value: supportRequest.subject,
				short: true
			}, {
				title: 'Country',
				value: supportRequest.country,
				short: true
			}, {
				title: 'Email',
				value: supportRequest.email,
				short: true
			}, {
				title: 'Phone',
				value: supportRequest.phone,
				short: true
			}, {
				title: 'Message',
				value: supportRequest.message,
				short: false
			}]
		}]
	};

	return body;
}

function packageWholesaleRequest(wholesaleRequest) {
	var text = 'New wholesale application from ' + wholesaleRequest.companyName + '.\n';
	text +='Full application was sent via email.';
	var body = {
		attachments: [{
			fallback: text,
			pretext: text,
			fields: [{
				title: 'First Name',
				value: wholesaleRequest.firstName,
				short: true
			}, {
				title: 'Last Name',
				value: wholesaleRequest.lastName,
				short: true
			}, {
				title: 'Company Name',
				value: wholesaleRequest.companyName,
				short: true
			}, {
				title: 'Email',
				value: wholesaleRequest.email,
				short: true
			}, {
				title: 'Phone',
				value: wholesaleRequest.phone,
				short: true
			}, {
				title: 'Country',
				value: wholesaleRequest.country,
				short: true
			}]
		}]
	};

	return body;
}

function getOrders() {
	var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders', 'GET', false);
	options.qs = {
		orderstatus: 1,
		limit: 1
	};
	request(options, function(err, response, body) {
		console.log('got the orders');
		adjustInventory(body);
	});
}

function adjustInventory(cartOrders) {
	cartOrders.forEach((order) => {
		var canadian = order.InvoiceNumberPrefix == 'CA-';
		var promises = [];

		order.OrderItemList.forEach((item) => {
			var sku = item.ItemID.trim();
			var findItem = Item.findOne({sku: sku});
			var productUpdate = findItem.then((dbItem) => {
				if (dbItem != null && dbItem.isOption) {
					advancedOptionUpdate(dbItem, item.ItemUnitStock - item.ItemQuantity, !canadian);
				} else if (dbItem != null && !dbItem.isOption) {
					var newStock = item.ItemUnitStock - item.ItemQuantity;
					if (newStock < 0) {
						newStock = 0;
					}
					var newProductStock = {
						SKUInfo: {
							SKU: dbItem.sku,
							Stock: newStock
						}
					};
					dbItem.stock = newStock;
					dbItem.usStock = newStock;
					dbItem.canStock = newStock;
					dbItem.save();
					return newProductStock;
				} else {
					console.log('item not found: ' + sku);
					console.log('order: ' + order.OrderID);
					console.log('order: ' + order.InvoiceNumberPrefix + order.InvoiceNumber);
				}
				return null;
			});
			promises.push(productUpdate);
		});

		Promise.all(promises).then((productUpdates) => {
			var index = productUpdates.indexOf(null);
			while (index != -1) {
				productUpdates.splice(index, 1);
				index = productUpdates.indexOf(null);
			}
			console.log(productUpdates);

			var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products', 
				'PUT', !canadian);
			options.body = productUpdates;
			request(options, function(err, response, body) {
				console.log('saved items');
				console.log(body);
			});
		});
	});
}

function advancedOptionUpdate(dbItem, stock, canadian) {
  var url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+dbItem.catalogId+'/AdvancedOptions/'+dbItem.optionId;
  if (canadian) {
  	url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+dbItem.catalogIdCan+'/AdvancedOptions/'+dbItem.optionIdCan; 
  }

  if (stock < 0) {
  	stock = 0;
  }

	var options = helpers.get3DCartOptions(url, 'PUT', canadian);

  options.body = {
    AdvancedOptionStock: stock,
    AdvancedOptionSufix: dbItem.sku
  };

  dbItem.stock = stock;
  dbItem.usStock = stock;
  dbItem.canStock = stock;

  dbItem.save();

  request(options, function(err, response, body) {
  	console.log(body);
  });
}

module.exports = {
	route: function(app, qbws) {
		app.post('/webhooks/new-order', jsonParser, function(req, res) {
			var orders = req.body;
			adjustInventory(orders);
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
					var updatingOrder = updateOrderInfo(newOrder, order);
					sendOrderToSlack(order);
					updatingOrder.then(function(updatedOrder) {
						updateCustomerInfo(updatedOrder, order);
						qbws.emptyQueue();
						helpers.createInvoices(qbws);
					});
				});

				qbws.setFinalCallback(function() {
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
						});
					});
					
					/** Don't move them to processing until after they have been printed by the sorter.
					helpers.markCompletedOrdersAsProcessing(settings.timecodes, function(err, results) {
						// send import report to slack.
						orderBot({text: results.length + ' orders were moved to processing.'});
						// Don't remove the order yet. The order should be purged after it's moved to processing
						Order.remove({imported: true})
						.then((removed) => {
							console.log('Purged' + removed.length + ' orders.');
						})
						.err((err) => {
							console.log(err);
						});
					});
					*/
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

		app.post('/webhooks/contact', jsonParser, function(req, res) {
			var support = req.body;
			customerSupportBot(packageSupportRequest(support));
			mailer.sendSupportMail(support.firstName, 
				support.lastName, 
				support.email,
				support.phone,
				support.country,
				support.subject,
				support.message, 
				function(err, info) {
					res.send('Received support request.');
				});
		});

		app.post('/webhooks/wholesale', jsonParser, function(req, res) {
			var wholesaleApp = req.body;
			var slackMessage = packageWholesaleRequest(wholesaleApp);
			customerSupportBot(slackMessage);

			var mailOptions = {
				from: 'sales@ecstasycrafts.com',
				replyTo: wholesaleApp.email,
				to: 'sales@ecstasycrafts.com',
				subject: '[Wholesale Application] from ' + wholesaleApp.companyName
			};

			var emailContent = 'Wholesale application request from ' + wholesaleApp.firstName + ' ' + wholesaleApp.lastName + '.\n';
			emailContent += 'Company Name: ' + wholesaleApp.companyName + '\n';
			emailContent += 'Email: ' + wholesaleApp.email + '\n';
			emailContent += 'Phone: ' + wholesaleApp.phone + '\n';
			emailContent += 'Website: ' + wholesaleApp.website + '\n';
			emailContent += 'Address 1: ' + wholesaleApp.address1 + '\n';
			emailContent += 'Address 2: ' + wholesaleApp.address2 + '\n';
			emailContent += 'City: ' + wholesaleApp.city + '\n';
			emailContent += 'State: ' + wholesaleApp.state + '\n';
			emailContent += 'Zip: ' + wholesaleApp.zip + '\n';
			emailContent += 'Country: ' + wholesaleApp.country + '\n';
			emailContent += 'Tax ID: ' + wholesaleApp.taxId + '\n';
			emailContent += 'References: ' + wholesaleApp.references + '\n';

			mailOptions.text = emailContent;

			mailer.sendMail(mailOptions, function(err, info) {
				res.send('Received wholesale application.');
			});
		});

		app.get('/webhooks/mailchimp', jsonParser, function(req, res) {
			res.send('Received webhook notification');
		});

		app.post('/webhooks/mailchimp', formParser, function(req, res) {
			console.log(req.body);
			res.send('Received notification');
		});
	},
	orderBot: orderBot
}