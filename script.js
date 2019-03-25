require('dotenv').config();
var mongoose = require('mongoose');
var Order = require('./app/model/order');
var Batch = require('./app/model/batch');
var Customer = require('./app/model/customer');
var Item = require('./app/model/item');
const chalk = require('chalk');
const shortid = require('shortid');
const moment = require('moment');

// prepare DB
var uriString = process.env.MONGODB_URI || 
                process.env.MONGOHQ_URL ||
                'mongodb://localhost/db';

mongoose.connect(uriString, {
  useNewUrlParser: true
}, async function (err, res) {
  if (err) {
    console.log('Error connecting to: ' + uriString + '. ' + err);
  } else {
    let fromDate = moment('2019-03-01').utc();
    let to = moment('2019-03-20').utc();
    console.log('running aggregate');
    Order.aggregate().match({orderDate: {$gte: fromDate.toDate(), $lt: to.toDate()}, isBackorder: false})
      .project({
        items: 1,
        orderValue: 1,
        orderDate: 1
      })
      .unwind('items')
      .group({
        _id: '$items.item',
        totalOrdered: {
          $sum: '$items.quantity'
        }
      })
      .sort('-totalOrdered').then(aggregate => {
        Item.populate(aggregate, {path: '_id', select: 'sku name manufacturerName'}).then(items => {
          console.log(items);
        });
      });
  }
});