const express = require('express');
const router = express.Router();
const User = require('./model/user');
const Customer = require('./model/customer');
const Batch = require('./model/batch');
const Order = require('./model/order');
const pug = require('pug');
const mailer = require('./mailer');
const path = require('path');
const juice = require('juice');
const fs = require('fs');
// TODO permissions inside middle ware
router.use(async (req, res, next) => {
  if (req.session.userId == null || req.session.userId == undefined) {
    res.status(401).send('Error accessing the API. Please login.');
  } else {
    req.session.user = await User.findOne({_id: req.session.userId}).populate('defaultCompany').exec();
    next();
  }
});

router.use(express.json({limit: '150mb'}));
router.use(express.urlencoded({extended: true, limit: '150mb'}));

router.get('/orders/search/:searchTerms', async (req, res) => {
  let searchRegex = {
    $regex: req.params.searchTerms,
    $options: 'i'
  };

  // first find the customers that match
  let customers = await Customer.find({ 
    $or: [{
      firstname: searchRegex
    }, {
      lastname: searchRegex
    }, {
      email: searchRegex
    }, {
      companyName: searchRegex
    }]
  });

  let customerIds = customers.map(customer => customer._id);
  Order.find({$or: [{customer: {$in: customerIds}}, {orderId: searchRegex}]}).populate('customer').sort('-orderDate').limit(200).then(orders => {
    res.json(orders);
  }).catch(err => {
    res.status(500).send(err);
  });
});

router.post('/batch/start/custom', (req, res) => {
  let orderIds = req.body.orders;
  Batch.createCustomBatch(orderIds, req.session.user).then(newBatch => {
    res.json(newBatch);
  }).catch(err => {
    res.status(500).send(err);
  });
});

router.post('/batch/start/auto', (req, res) => {
  Batch.createAutoBatch(req.body.maxItems, req.body.maxSkus, req.body.type, req.session.user).then(batch => {
    res.json(batch);
  }).catch(err => {
    console.log(err);
    res.status(500).send(err);
  });
});

router.post('/batch/finish', (req, res) => {
  Batch.findOne({_id: req.body._id}).then(batch => {
    batch.finish(req.body, req.session.user).then(batch => {
      res.json(batch);
    }).catch(err => {
      console.log(err);
      res.status(500).send(err);
    });
  });
});

router.put('/orders', async (req, res) => {
  let orders = req.body;
  for (order of orders) {
    let dbOrder = await Order.findOne({_id: order._id});
    if (dbOrder) {
      dbOrder.set(order);
      await dbOrder.save();
    } else {
      console.log('invalid order');
    }
  }
  res.send('success');
});

router.get('/order/email/invoice/:orderId', async (req, res) => {
  let order = await Order.findOne({_id: req.params.orderId}).populate('customer items.item').exec();
  let emailContent = pug.renderFile(path.resolve(__dirname, '../views/emails/invoice.pug'), {
    order: order,
    moment: require('moment')
  });
  let css = fs.readFileSync(path.resolve(__dirname, '../node_modules/bootstrap/dist/css/bootstrap.css'), 'utf8');
  let html = juice.inlineContent(emailContent, css);
  let mailOptions = {
    from: 'Ecstasy Crafts <support@ecstasycrafts.com>',
    to: 'mattoskamp@gmail.com', //order.customer.email,
    subject: 'Invoice for order ' + order.orderId,
    html: html
  };

  mailer.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.log(err);
      res.status(500).send(err);
    } else {
      res.send('Successfully sent email to customer');
    }
  });
});

module.exports.router = router;