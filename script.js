require('dotenv').config();
var mongoose = require('mongoose');
var Order = require('./app/model/order');
var Batch = require('./app/model/batch');
var Customer = require('./app/model/customer');
var Item = require('./app/model/item');
const chalk = require('chalk');
const shortid = require('shortid');

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
    Item.find({}).then(async items => {
      var index = 0;
      for (item of items) {
        try {
          await item.calculateSalesMetrics();
          if (item.sku == undefined) {
            console.log(item);
          }

          console.log(((index / items.length) * 100).toFixed(2));
        } catch (err) {
          console.log('error calculating metrics for ' + item.sku)
        }
        index++;
      }
      console.log('Done');
    });
  }
});