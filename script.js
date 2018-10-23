require('dotenv').config();
var mongoose = require('mongoose');
var Order = require('./app/model/order');
var Customer = require('./app/model/customer');
var Item = require('./app/model/item');
const chalk = require('chalk');

// prepare DB
var uriString = process.env.MONGODB_URI || 
                process.env.MONGOHQ_URL ||
                'mongodb://localhost/db';

mongoose.connect(uriString, {
  useMongoClient: true,
  socketTimeoutMS: 0,
  autoReconnect: true,
  keepAlive: true
}, async function (err, res) {
  if (err) {
    console.log('Error connecting to: ' + uriString + '. ' + err);
  } else {
    await Customer.remove({});
    await Customer.find({}).then(async customers => {
      for (customer of customers) {
        customer.orders = [];
        await customer.save();
      }
    });

    await Order.find({}).then(async orders => {
      var promises = [];
      for (order of orders) {
        try {
          await order.updateCustomer();
        } catch (err) {
          console.log(err);
        }
      }
    });

    console.log('Done');
  }
});