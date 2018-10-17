require('dotenv').config();
var mongoose = require('mongoose');
var Order = require('./app/model/order');
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
    Item.findOne({sku: '7001'}).then(item => {
      item.refreshFrom3DCart();
    });
  }
});