var helpers = require('./helpers');
var schedule = require('node-schedule');
var routes = require('./routes');
var cart3d = require('./3dcart');
var amazon = require('./amazon');
var walmart = require('./walmart');
var Order = require('./model/order.js');
var Item = require('./model/item.js');

module.exports = function(qbws) {
  var sync = schedule.scheduleJob('0 4-20 * * *', () => {
    syncOrdersAndInventory(qbws);
  }); 
  var refresh = schedule.scheduleJob('0 21 * * *', () => {
    cart3d.refreshFrom3DCart().then(() => {
      console.log('Finished refreshing the items');
    });
    amazon.updateAllInventory().then(response => console.log(response));
    walmart.updateAllInventory().then(response => console.log(response));
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
      helpers.queryAllItems(qbws).then(() => {
        qbws.addFinalCallback(() => {
          saveInventory().then((responses) => {
            console.log(responses);
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