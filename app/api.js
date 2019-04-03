const express = require('express');
const router = express.Router();
const User = require('./model/user');
const Customer = require('./model/customer');
const Batch = require('./model/batch');
const Order = require('./model/order');
const Item = require('./model/item');
const Manufacturer = require('./model/manufacturer');
const Marketplace = require('./model/marketplace');
const pug = require('pug');
const mailer = require('./mailer');
const CartMarketplace = require('./cartMarketplace');
const path = require('path');
const juice = require('juice');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const moment = require('moment');
let qbws;

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

router.get('/order/:orderId/cart/refresh', async (req, res) => {
  let theOrder = await Order.findOne({_id: req.params.orderId});
  await theOrder.refreshFrom3DCart();
  res.json(theOrder);
});

router.get('/order/:orderId/cart/payments', async (req, res) => {
  let theOrder = await Order.findOne({_id: req.params.orderId});
  theOrder = await theOrder.checkPayment();
  if (theOrder.paid && !theOrder.flags.paymentsApplied && theOrder.invoiced) {
    theOrder.applyPaymentsToQB(this.qbws);
  }
  res.json(theOrder);
});

router.put('/order/:orderId/payment', async (req, res) => {
  let theOrder = await Order.findOne({_id: req.params.orderId});
  let response = await theOrder.addPayment(req.body);
  res.json(response);
});

router.post('/order/:orderId/comment', async (req, res) => {
  let theOrder = await Order.findOne({_id: req.params.orderId});
  theOrder = await theOrder.addComment(req.body.comment, req.session.user._id);
  res.json(theOrder);
});

router.post('/qb/payments/:orderId', async (req, res) => {
  let theOrder = await Order.findOne({_id: req.params.orderId});
  theOrder.applyPaymentsToQB(this.qbws);
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
    to: order.customer.email,
    subject: 'Invoice for order ' + order.orderId,
    html: html
  };

  mailer.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.log(err);
      res.status(500).send(err);
    } else {
      order.flags.emailSent = true;
      order.save();
      res.send('Successfully sent email to customer');
    }
  });
});

router.get('/stripe/customer/:email', (req, res) => {
  stripe.customers.list({email: req.params.email}).then(response => {
    let customer = response.data[0];
    if (customer.email == req.params.email) {
      res.send(customer);
    } else {
      res.status(400).send('No customer found');
    }
  });
});

router.post('/stripe/invoice/:orderId', async (req, res) => {
  // this will attempt to send the customer an email to pay the invoice via stripe
  let order = await Order.findOne({_id: req.params.orderId}).populate('customer items.item').exec();

  if (order.stripeInvoice) {
    return res.status(400).send('Stripe invoice already exists.');
  }

  let stripeCustomer = await stripe.customers.list({email: 'mattoskamp@gmail.com'}); // order.customer.email});
  stripeCustomer = stripeCustomer.data[0];
  // if (!stripeCustomer || order.customer.email != stripeCustomer.email) {
  //   console.log('No customer exists in Stripe. Creating a new one.');
  //   stripeCustomer = await stripe.customers.create({email: order.customer.email});
  // }
  console.log(stripeCustomer);

  // add the items to the invoice
  let lineItem = await stripe.invoiceItems.create({
    customer: stripeCustomer.id,
    currency: customer.currency,
    amount: 10,
    quantity: 2,
    description: 'Test Item',
    livemode: false
  });

  console.log(lineItem);

  let invoice = await stripe.invoices.create({
    customer: stripeCustomer.id,
    custom_fields: [{
      name: 'Order ID',
      value: 'AB-12345'
    }]
  });

  console.log(invoice);
  invoice = await stripe.invoices.finalizeInvoice(invoice.id);
  res.json(invoice);
});

router.get('/cart/manufacturers', async (req, res) => {
  await Manufacturer.getManufacturersFrom3DCart('https://www.ecstasycrafts.com',
    process.env.CART_PRIVATE_KEY,
    process.env.CART_TOKEN);
  await Manufacturer.getManufacturersFrom3DCart('https://www.ecstasycrafts.ca',
    process.env.CART_PRIVATE_KEY,
    process.env.CART_TOKEN_CANADA);
  let manufacturers = await Manufacturer.find({});
  res.json(manufacturers);
});

router.get('/cart/customers/:email', async (req, res) => {
  let canadaCart = new CartMarketplace('https://www.ecstasycrafts.ca',
    process.env.CART_PRIVATE_KEY,
    process.env.CART_TOKEN_CANADA);
  let canadaCustomer = await canadaCart.getCustomer(req.params.email);
  let usCart = new CartMarketplace('https://www.ecstasycrafts.com',
    process.env.CART_PRIVATE_KEY,
    process.env.CART_TOKEN);
  let usCustomer = await usCart.getCustomer(req.params.email);
  res.json({
    us: usCustomer[0],
    can: canadaCustomer[0]
  });
});

router.get('/customers/:email', async(req, res) => {
  try {
    let customer = await Customer.findCustomer(req.params.email);
    res.json(customer);
  } catch (err) {
    console.log(err);
    console.log('no customers found.');
    res.json({});
  }
});

router.get('/reports/items/sales', (req, res) => {
  console.log(req.query);
  let fromDate = moment(req.query.from).utc().startOf('day');
  let to = moment(req.query.to).utc().startOf('day');
  Order.aggregate().match({orderDate: {$gte: fromDate.toDate(), $lt: to.toDate()}, isBackorder: false})
  .project({
    items: 1,
    orderValue: 1,
    orderDate: 1,
    orderId: 1
  })
  .unwind('items')
  .group({
    _id: '$items.item',
    totalOrdered: {
      $sum: '$items.quantity'
    },
    totalPicked: {
      $sum: '$item.pickedQuantity'
    },
    orders: {
      $push: '$orderId'
    }
  })
  .sort('-totalOrdered').then(aggregate => {
    Item.populate(aggregate, {path: '_id', select: 'sku name manufacturerName'}).then(items => {
      console.log(items.length);
      if (req.query.manufacturer == 'all') {
        res.json(items);
      } else {
        items = items.filter(item => item._id.manufacturerName == req.query.manufacturer);
        res.json(items);
      }
    });
  });
});

router.post('/marketplace', async (req, res) => {
  console.log(req.body);
  let newMarketplace = new Marketplace();
  newMarketplace.set(req.body);
  await newMarketplace.save();
  res.json(newMarketplace);
});

router.get('/marketplace/:id/test', async (req, res) => {
  let marketplace = await Marketplace.findOne({_id: req.params.id});
  marketplace.test().then(response => {
    res.json(response);
  }).catch(err => {
    console.log(err);
    res.status(500).send(err);
  });
});

router.get('/marketplace/:id/import/orders', async (req, res) => {
  let marketplace = await Marketplace.findOne({_id: req.params.id});
  let responses = await marketplace.importOrders();
  res.json(responses);
});

router.get('/marketplace/:id/import/skuinfo', async (req, res) => {
  let marketplace = await Marketplace.findOne({_id: req.params.id});
  let responses = await marketplace.getSKUInfos();
  res.json(responses);
});

router.get('/marketplace/:id/import/products', async (req, res) => {
  let marketplace = await Marketplace.findOne({_id: req.params.id});
  marketplace.getItems().then(responses => {
    console.log('done');
  })
  res.json('Importing items');
});

module.exports.router = router;
module.exports.setQBWS = qbws => {
  this.qbws = qbws;
}