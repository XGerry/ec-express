require('dotenv').config();
var mongoose = require('mongoose');
var Order = require('./app/model/order');
var Customer = require('./app/model/customer');
var Item = require('./app/model/item');
var Batch = require('./app/model/batch');
const chalk = require('chalk');

var numberOfTests = 0;
var passingTests = 0;

var testItems = [];

// prepare DB
var uriString = process.env.MONGODB_URI || 
                process.env.MONGOHQ_URL ||
                'mongodb://localhost/test';

mongoose.connect(uriString, {
  useMongoClient: true,
  socketTimeoutMS: 0,
  autoReconnect: true,
  keepAlive: true
}, async function (err, res) {
  if (err) {
    console.log('Error connecting to: ' + uriString + '. ' + err);
  } else {
    await cleanUp();
    try {
    	await testCreateItem();
    	pass();
    } catch (e) {
    	fail(e);
    }
    await cleanUp();
    try {
    	await testUpdateItem();
    	pass();
    } catch (e) {
    	fail(e);
    }
    await cleanUp();
    try {
    	await testImportOrder();
    	pass();
    } catch (e) {
    	fail(e);
    }
    await cleanUp();
    try {
    	await testBatchCreation();
    	pass();
    } catch (e) {
    	fail(e);
    }

    console.log(chalk.greenBright('All tests complete.'));
    var percentagePassing = ((passingTests / numberOfTests) * 100).toFixed(0);
    console.log(chalk.greenBright(percentagePassing + '% of tests passed.'));
    process.exit();
  }
});

// helpers

function pass() {
 	console.log(chalk.green('PASSED'));
 	passingTests++;
 	numberOfTests++;
}

function fail(e) {
	console.log(e);
  console.log(chalk.redBright('FAILED'));
  numberOfTests++;
}

async function cleanUp() {
  await Item.remove({});
  await Order.remove({});
  await Customer.remove({});
}

function getTestCartItem(name, numberOfOptions) {
  var testItem = {
    SKUInfo: {
      CatalogID: 1,
      SKU: name,
      Name: 'This is a test item',
      Cost: 1.1,
      Price: 1.1,
      OnSale: false,
      Stock: 10
    },
    GTIN: '1234567890',
    Hide: false,
    WarehouseLocation: 'Test',
    AdvancedOptionList: [],
    CategoryList: [{
      CategoryID: 1,
      CategoryName: 'TEST_CATEGORY_1',
    }, {
      CategoryID: 2,
      CategoryName: 'TEST_CATEGORY_2'
    }],
    PriceLevel7: 5
  }

  for (var i = 0; i < numberOfOptions; i++) {
  	testItem.AdvancedOptionList.push({
      AdvancedOptionCode: (1000+i),
      AdvancedOptionSufix: name+'_OPTION_'+i,
      AdvancedOptionName: name+'_OPTION_NAME_'+i,
      AdvancedOptionStock: 10
    });
  }
  return testItem;
}

function createItemInDB(name, numberOfOptions) {
	var testItem = getTestCartItem(name, numberOfOptions);
  var newItem = new Item();
  newItem.sku = testItem.SKUInfo.SKU.trim();
  return newItem.updateFrom3DCart(testItem);
}

function getTestCartOrder(email, id, canadian, itemList) {
	var cartOrder = {
		InvoiceNumberPrefix: canadian ? 'CA-' : 'AB-',
		InvoiceNumber: id,
		OrderDate: new Date(),
		OrderStatusID: 0,
		BillingFirstName: 'Mary',
		BillingLastName: 'Poppins',
		BillingAddress: '123 Fake St',
		BillingCity: 'Belleville',
		BillingState: 'ON',
		BillingZipCode: 'K7P 3G9',
		BillingCountry: 'CA',
		BillingPhoneNumber: '1234567890',
		BillingPaymentMethod: 'Online Credit Card',
		BillingPaymentMethodID: 49,
		BillingEmail: email,
		ShipmentList: [{
			ShipmentID: 1,
      ShipmentLastUpdate: new Date(),
      ShipmentBoxes: 1,
      ShipmentInternalComment: 'sample string 1',
      ShipmentOrderStatus: 1,
      ShipmentAddress: 'sample string 2',
      ShipmentAddress2: 'sample string 3',
      ShipmentAlias: 'sample string 4',
      ShipmentCity: 'sample string 5',
      ShipmentCompany: 'sample string 6',
      ShipmentCost: 1.1,
      ShipmentCountry: 'sample string 7',
      ShipmentEmail: 'sample string 8',
      ShipmentFirstName: 'sample string 9',
      ShipmentLastName: 'sample string 10',
      ShipmentMethodID: 1,
      ShipmentMethodName: 'sample string 11',
      ShipmentShippedDate: 'sample string 12',
      ShipmentPhone: 'sample string 13',
      ShipmentState: 'sample string 14',
      ShipmentZipCode: 'sample string 15',
      ShipmentTax: 1.1,
      ShipmentWeight: 1.1,
      ShipmentTrackingCode: 'sample string 16',
      ShipmentUserID: 'sample string 17',
      ShipmentNumber: 1,
      ShipmentAddressTypeID: 1
		}],
		OrderItemList: [],
		OrderAmount: 100,
	}

	itemList.forEach(i => {
		cartOrder.OrderItemList.push({
			ItemID: i,
			ItemQuantity: 10,
			ItemUnitPrice: 1.1
		});
	});

	return cartOrder;
}

// tests

function testCreateItem() {
  console.log(chalk.cyan('Testing add item from 3D Cart'));
  try {
    return createItemInDB('TEST_ITEM', 10).then(item => {
    	return Item.find({_id: { $in: item.children }}).then(children => {
    		children.forEach(c => {
    			if (!c.parent.equals(item._id)) {
    				return Promise.reject('Wrong parent _id');
    			}
    		});
    		if (children.length != 10) {
    			return Promise.reject('Not enough children!');
    		}
    	});
    }).catch(err => {
      return Promise.reject(err);
    });
  } catch (e) {
    return Promise.reject(e);
  }
}

function testUpdateItem() {
	console.log(chalk.cyan('Testing updating existing item from 3D Cart'));
	// create the item first
	return createItemInDB('TEST_ITEM', 10).then(item => {
		// now update it
		var testCartItem = getTestCartItem('TEST_ITEM', 5);
		return item.updateFrom3DCart(testCartItem).then(updatedItem => {
			if (updatedItem.children.length != 5) {
				return Promise.reject('Wrong number of children');
			}
		});
	});
}

async function testImportOrder() {
	console.log(chalk.cyan('Testing importing an order from 3D Cart'));
	await createItemInDB('Test_1', 0);
	await createItemInDB('Test_2', 0);
	await createItemInDB('Test_3', 0);

	var testOrder = getTestCartOrder('test@123.com', 1, true, ['Test_1', 'Test_2']);
	var newOrder = new Order();
	var orderId = testOrder.InvoiceNumberPrefix + testOrder.InvoiceNumber;
	newOrder.orderId = orderId;
	try {
		await newOrder.updateFrom3DCart(testOrder);
	} catch (e) {
		if (e.statusCode == 404)
			console.log('Expected the 404 error');
		else {
      console.log(e);
			return Promise.reject('Error creating the order');
		}
	}

	// verify the order exists
	return Order.findOne({orderId: orderId}).populate('customer').then(order => {
		if (order.customer.email != 'test@123.com') {
			return Promise.reject('Order not imported properly.');
		}
	});
}

async function testBatchCreation() {
	console.log(chalk.cyan('Testing batch creation'));
	await createItemInDB('Test_1', 0);
	await createItemInDB('Test_2', 0);
	await createItemInDB('Test_3', 0);

	for (var i = 0; i < 10; i++) {
		var testOrder = getTestCartOrder(i+'-email', i, true, ['Test_1', 'Test_2']);
		var newOrder = new Order();
		newOrder.orderId = testOrder.InvoiceNumberPrefix + testOrder.InvoiceNumber;
		if (i == 9) {
			// rush the last order
			newOrder.rush = true;
		}
		try {
			await newOrder.updateFrom3DCart(testOrder);
		} catch (e) {
			if (e.statusCode == 404)
				console.log('Expected the 404 error');
			else {
        console.log(e);
				return Promise.reject('Error creating the order');
			}
		}
	}
	
	return Batch.createAutoBatch(250, 35, 'ca').then(batch => {
		console.log(batch.orders.length);
		console.log(batch.numberOfItems);
		console.log(batch.numberOfSkus);
	});
}