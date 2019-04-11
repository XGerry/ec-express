var request = require('request');
var Order = require('./model/order');
var Customer = require('./model/customer');
var Marketplace = require('./model/marketplace');
var Item = require('./model/item');
let helpers = require('./helpers');
var amazon = require('./amazon');
var Settings = require('./model/settings');
var mailer = require('./mailer');
var rp = require('request-promise-native');
let express = require('express');
let slackbot = require('./slackbot');
let router = express.Router();

router.get('/test', (req, res) => {
	console.log('Received request');
	res.send('Hello, world!');
});

router.post('/order/new/:marketplaceId', async (req, res) => {
	console.log('received webhook for new order');
	let cartOrders = req.body;
	let marketplace = await Marketplace.findOne({_id: req.params.marketplaceId});
	if (!marketplace) {
		return res.status(400).send('No marketplace found.');
	}
	helpers.setTimeCode();
	await marketplace.addOrders(cartOrders, helpers.getTimeCode());
	cartOrders.forEach(order => {
		sendOrderToSlack(order, marketplace);
	});
	res.send('Done.');
});

// OLD STUFF BELOW

function sendOrderToSlack(order, marketplace) {
	let orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
	var infoURL = marketplace.url + '/admin/order_details.asp?orderid=' + order.OrderID;
	var message = order.BillingFirstName + ' ' + order.BillingLastName;
	message += ' placed an order for $' + order.OrderAmount.toFixed(2) + '.';
	message += ' <'+infoURL+'|'+orderId+'>';
	if (order.BillingCompany != '') {
		message += ' - ' + order.BillingCompany + ' (Wholesale)';
	}

	slackbot.orderBot({ text: message });
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

module.exports = {
	route: function(app, qbws) {
		app.post('/webhooks/new-order', function(req, res) {
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
						helpers.createInvoiceRequests(qbws);
					});
				});
			});
			res.send('New order.');
		});

		app.post('/webhooks/new-customer', function(req, res) {
			var customers = req.body;
			customers.forEach((customer) => {
				sendCustomerToSlack(customer);
			});

			res.send('New customer.');
		});

		app.post('/webhooks/new-product', function(req, res) {
			var products = req.body;
			products.forEach((product) => {
				sendNewProductToSlack(product)
			});

			res.send('New product.');
		});

		app.post('/webhooks/wholesale', function(req, res) {
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
			emailContent += 'Company Type: ' + wholesaleApp.companyType + '\n';
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
	},
	router: router
}