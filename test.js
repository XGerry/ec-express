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
    await cleanUp();
    var tests = [];
    tests.push(testCreateItem());

    Promise.all(tests).then(() => {
      console.log(chalk.greenBright('All tests passed!'));
      cleanUp().then(() => {
        process.exit();
      });
    }).catch(e => {
      console.log(chalk.redBright('There are failing tests!'));
      cleanUp().then(() => {
        process.exit(1);
      });
    });
  }
});

function testCreateItem() {
  console.log('Testing item from 3D Cart');

  var testItem = {
    SKUInfo: {
      CatalogID: 1,
      SKU: 'TEST_ITEM',
      Name: 'This is a test item',
      Cost: 1.1,
      Price: 1.1,
      OnSale: false,
      Stock: 10
    },
    GTIN: '1234567890',
    Hide: false,
    WarehouseLocation: 'Test',
    AdvancedOptionList: [{
      AdvancedOptionCode: 12345,
      AdvancedOptionSufix: 'TEST_OPTION',
      AdvancedOptionName: 'OPTION_NAME',
      AdvancedOptionStock: 10
    }],
    CategoryList: [{
      CategoryID: 1,
      CategoryName: 'TEST_CATEGORY_1',
    }, {
      CategoryID: 2,
      CategoryName: 'TEST_CATEGORY_2'
    }],
    PriceLevel7: 5
  }

  var newItem = new Item();
  newItem.sku = testItem.SKUInfo.SKU;
  try {
    return newItem.updateFrom3DCart(testItem).then(item => {
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

async function cleanUp() {
  return Item.collection.remove({sku: {$in: ['TEST_ITEM','TEST_OPTION']}});
}