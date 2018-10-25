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
    await Order.find({}).then(async orders => {
      for (order of orders) {
        console.log(order.orderId);
        try {
          order.isCartOrder = true;
          await order.save();
        } catch (err) {
          console.log(err);
        }
      }
    });

    console.log('Done');
  }
});