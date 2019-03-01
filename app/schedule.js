var helpers = require('./helpers');
var schedule = require('node-schedule');
var routes = require('./routes');
var cart3d = require('./3dcart');
var amazon = require('./amazon');
var walmart = require('./walmart');
var Order = require('./model/order.js');
var Item = require('./model/item.js');
const CartMarketplace = require('./cartMarketplace');

module.exports = function(qbws) {
  var sync = schedule.scheduleJob('0 4,6,8,10,12,14,16,18,20 * * *', () => {
    syncOrdersAndInventory(qbws);
  }); 
  var refresh = schedule.scheduleJob('0 21 * * *', () => {
    cart3d.refreshFrom3DCart().then(() => {
      console.log('Finished refreshing the items');
      amazon.updateAllInventory().then(response => console.log(response));
      walmart.updateAllInventory().then(response => console.log(response));
      helpers.queryAllItems(qbws); // update from quickbooks
    });
  });

  //syncTutti(qbws);
  //getPromotions();
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
        dbItem.setStock = item.SKUInfo.Stock;
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