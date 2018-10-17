require('dotenv').config();
var mongoose = require('mongoose');
var Order = require('./app/model/order');
var Item = require('./app/model/item');
const chalk = require('chalk');

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
    var tests = [];
    //tests.push(testCreateItem());
    //tests.push(testUpdateItem());

    await Item.remove({});
    await testCreateItem();
    await Item.remove({});
    await testUpdateItem();

    console.log(chalk.greenBright('All tests complete.'));
    process.exit();
  }
});

// helpers

async function cleanUp() {
  return Item.collection.remove({sku: {$in: testItems}});
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

// tests

function testCreateItem() {
  console.log(chalk.cyan('Testing add item from 3D Cart'));
  try {
    return createItemInDB('TEST_ITEM', 10).then(item => {
      console.log(chalk.green('PASSED'));
      return Promise.resolve();
    }).catch(err => {
      console.log(err);
      console.log(chalk.redBright('FAILED'));
      return Promise.reject();
    });
  } catch (e) {
    console.log(e);
    console.log(chalk.redBright('FAILED'));
    return Promise.reject();
  }
}

function testUpdateItem() {
	console.log(chalk.cyan('Testing updating existing item from 3D Cart'));
	// create the item first
	return createItemInDB('TEST_ITEM', 10).then(item => {
		// now update it
		var testCartItem = getTestCartItem('TEST_ITEM', 5);
		return item.updateFrom3DCart(testCartItem).then(updatedItem => {
			if (updatedItem.children.length == 5) {
				console.log(chalk.green('PASSED'));
				return Promise.resolve();
			} else {
    		console.log(chalk.redBright('FAILED'));
				return Promise.reject('FAILED');
			}
		});
	});
}

function testBatchCreation() {
	
}