var request = require('request');
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json({limit : '50mb'});
var Order = require('./model/order');
var Customer = require('./model/customer');
var Item = require('./model/item');
var helpers = require('./helpers');

function updateOrderInfo(order, cartOrder) {
  order.name = cartOrder.BillingFirstName + ' ' + cartOrder.BillingLastName;
  order.cartOrder = cartOrder;
  order.timecode = helpers.getTimeCode();
  order.canadian = cartOrder.InvoiceNumberPrefix == 'CA-';
  var itemList = [];
  if (cartOrder.OrderItemList) {
    cartOrder.OrderItemList.forEach(function(item) {
      // TODO
      var sku = item.ItemID.trim();
      var findingItem = Item.findOne({sku: sku});
      findingItem.then(function(doc) {
        doc.lastOrderDate = new Date(cartOrder.OrderDate);
        doc.save();
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

function sendToSlack(order) {
	var options = {
		url: 'https://hooks.slack.com/services/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',
		method: 'POST',
		json: true,
		body: {
			text: "Received a new order"
		}
	};

	request(options);
}

module.exports = {
	route: function(app) {
		app.post('/webhooks/new-order', jsonParser, function(req, res) {
			console.log(req.body);
			var orders = req.body;
			
			orders.forEach((order) => {
		    var orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
				var newOrder = new Order();
				newOrder.imported = false;
				newOrder.orderId = orderId;
				updateOrderInfo(newOrder, order);
				sendToSlack(order);
			});

			res.send('Got it');
		});
	}
}

