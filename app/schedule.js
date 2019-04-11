var helpers = require('./helpers');
var webhooks = require('./webhooks');
var schedule = require('node-schedule');
var routes = require('./routes');
var cart3d = require('./3dcart');
var amazon = require('./amazon');
var walmart = require('./walmart');
var Order = require('./model/order.js');
var Settings = require('./model/settings.js');
var Item = require('./model/item.js');
const Marketplace = require('./model/marketplace.js');
const CartMarketplace = require('./cartMarketplace');

module.exports = function(qbws) {
  // var sync = schedule.scheduleJob('0 0-20/2 * *', () => { // 0 4,6,8,10,12,14,16,18,20
  //   if (process.env.DEV_MODE == 'TRUE') {
  //     // do nothing
  //     console.log('Doing nothing because we are in DEV mode.');
  //   } else {
  //     //syncOrdersAndInventory(qbws);
  //     console.log('Syncing inventory from scheduler...');
  //     syncOrdersAndInventoryNew(qbws).then(() => {
  //       console.log('Done the new inventory system.');
  //     });
  //   }
  // }); 

  let refreshRule = new schedule.RecurrenceRule();
  refreshRule.hour = 21;
  refreshRule.minute = 0;

  var refresh = schedule.scheduleJob(refreshRule, async () => {
    let marketplaces = await Marketplace.find({});
    let promises = [];
    marketplaces.forEach(market => {
      promises.push(market.getItems());
    });

    Promise.all(promises).then(() => {
      console.log('Finished refreshing the items');
      amazon.updateAllInventory().then(response => console.log(response));
      walmart.updateAllInventory().then(response => console.log(response));
      helpers.queryAllItems(qbws); // update from quickbooks
    });
  });

  let rule = new schedule.RecurrenceRule();
  rule.hour = new schedule.Range(0, 20, 2);
  rule.minute = 0;

  let test = schedule.scheduleJob(rule, function() {
    if (process.env.DEV_MODE == 'TRUE') {
      console.log('Doing nothing because we are in DEV mode.');
    } else {
      syncOrdersAndInventoryNew(qbws).then(() => {
        console.log('Done the new inventory system.');
      });
    }
  });
}

function syncOrdersAndInventory(qbws) {
  console.log('Getting the orders');
  qbws.addStartingCallback(() => {
    console.log('Syncing inventory and orders from scheduler.');
    return Promise.resolve('Started!');
  });

  // get the orders from 3D Cart
  cart3d.getOrders({
    orderstatus: 1, // new
    limit: 200
  }, qbws).then(numberOfOrders => {
    console.log('Received ' + numberOfOrders + ' orders.');
    // Now, refresh the stock levels in 3D Cart
    console.log('Refreshing the items');
    cart3d.getItems(qbws, (counter, total) => {
      process.stdout.write((counter/total*100).toFixed(2) + '%\r');
    }).then(responses => {
      helpers.runInventory(qbws).then(() => {
        qbws.addFinalCallback(() => {
          saveInventory().then((responses) => {
            console.log('Finished saving');
          });
          return Promise.resolve('Finished');
        });
        // wait for the web connector to run
      });
    });
  });
}

function saveInventory() {
  var promises = [];

  var save3dCart = cart3d.saveItems(null, (progress, total) => {
    console.log((progress / total * 100).toFixed(2) + '%');
  })
  .then(() => {
    // also save the options
    cart3d.saveOptionItems((progress, total) => {
      process.stdout.write((progress / total * 100).toFixed(2) + '%\r');
    })
    .then(() => {
      console.log('Done the item options');
      cart3d.calculateBaseItemStock((progress, total) => {
        process.stdout.write((progress / total * 100).toFixed(2) + '%\r');
      })
      .then(() => {
        Item.find({updated:true}).then(items => {
          helpers.inventoryBot({
            text: items.length + ' items were synced with 3D Cart.'
          });
        });
      });
    });
  });

  // save the walmart inventory
  var saveWalmart = walmart.updateInventory();

  // save the amazon inventory
  var saveAmazon = amazon.updateInventory();

  promises.push(save3dCart);
  promises.push(saveWalmart);
  promises.push(saveAmazon);
  return Promise.all(promises);
}

// get items from Dani's store
async function syncTutti(qbws) {
  let tuttiStore = new CartMarketplace('https://www.tuttidesigns.com/', 
    process.env.CART_PRIVATE_KEY, process.env.TUTTI_TOKEN);
  let items = await tuttiStore.getItems();
  await Item.updateMany({}, {$set: {updated: false}});
  let promises = [];
  items.forEach(item => {
    let updateStock = Item.findOne({sku: item.SKUInfo.SKU}).then(dbItem => {
      if (dbItem) {
        dbItem.setStock(item.SKUInfo.Stock);
      } else {
        console.log('The item ' + item.SKUInfo.SKU + ' was not found.');
      }
    });
    return promises.push(updateStock);
  });

  Promise.all(promises).then(updatedItems => {
    updatedItems = updatedItems.filter(item => item != undefined);
    console.log(updatedItems.length + ' items were updated.');
    let items = updatedItems.map(dbItem => {
      return { 
        sku: dbItem.sku,
        newStock: dbItem.usStock
      }
    });
    let inventoryAdjustmentRequest = helpers.modifyItemsInventoryRq(items, 'Updated from Tutti Site.');
    qbws.addRequest(inventoryAdjustmentRequest);
    saveInventory().then(() => {
      console.log('done everything!');
    });
  });
}

async function getOrdersFromSL() {
  let responses = await Order.importOrders('https://didicrafts-com.3dcartstores.com',
    process.env.CART_PRIVATE_KEY,
    process.env.DIDI_TOKEN);

  console.log(responses);
}

async function getPromotions() {
  let canadaStore = new CartMarketplace('https://www.ecstasycrafts.ca',
    process.env.CART_PRIVATE_KEY, process.env.CART_TOKEN_CANADA);
  try {
    let promotions = await canadaStore.get('Promotions', {
      limit: 200
    });
    console.log(promotions);
  } catch(err) {
    console.log(err);
  }
}

async function getPaymentToken() {
  let canadaStore = new CartMarketplace('https://www.ecstasycrafts.ca',
    process.env.CART_PRIVATE_KEY, process.env.CART_TOKEN_CANADA);
  let tokens = await canadaStore.get('PaymentTokens');
  console.log(tokens);
}

async function syncOrdersAndInventoryNew(qbws) {
  let marketplaces = await Marketplace.find({});
  let settings = await Settings.findOne({});
  let promises = [];
  helpers.setTimeCode();
  settings.lastImport = helpers.getTimeCode();
  settings.lastImports = [helpers.getTimeCode()];
  await settings.save();
  for (market of marketplaces) {
    await market.importOrders(helpers.getTimeCode());
  }

  return Promise.all(promises).then(async () => {
    console.log('Done the refresh');
    helpers.generateSalesOrders(qbws);
    return getSKUInfos(qbws);
  });
}

async function getSKUInfos(qbws) {
  let marketplaces = await Marketplace.find({});
  let promises = [];
  marketplaces.forEach(market => {
    promises.push(market.getSKUInfos());
  });

  return Promise.all(promises).then(async response => {
    await helpers.runInventory(qbws);
    console.log('Everything is now updated. Run the web connector');
    qbws.addFinalCallback(async function() {
      let promises = [];
      // save the walmart inventory
      promises.push(walmart.updateInventory());
      // save the amazon inventory
      promises.push(amazon.updateInventory());
      marketplaces.forEach(market => {
        promises.push(market.updateInventory());
      });
      return Promise.all(promises).then(async () => {
        let updatedItems = await Item.find({updated:true});
        helpers.inventoryBot({
          text: updatedItems.length + ' items were synced with 3D Cart.'
        });
      });
    });
  });
}

async function test() {
  Marketplace.find({}).then(marketplaces => {
    marketplaces.forEach(async market => {
      console.log(market.name);
      let cart = market.getCart();
      let item = await Item.findOne({sku: "1016B"});
      let url = 'Products/' + item.marketplaceProperties.catalogId.get(market._id.toString()) + '/AdvancedOptions';
      console.log(url);
      let response = await cart.get(url);
      console.log(response);
    });
  });
}