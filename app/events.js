/**
 * For use with socket.io and the api
 */
 var cart3d = require('./3dcart');
 var amazon = require('./amazon');
 var facebook = require('./facebook');
 var helpers = require('./helpers');
 var walmart = require('./walmart');
 var Settings = require('./model/settings');

 module.exports = function(io, qbws) {
 	io.on('connection', function(socket) {

 		/**
 		 * Get the items from 3D Cart
 		 */
 		socket.on('getItems', function() {
 			cart3d.getItems(qbws, function(counter, total) {
 				socket.emit('getItemsProgress', {
 					progress: counter,
 					total: total
 				});
 			}, function(err) {
				socket.emit('getItemsFinished');
 			});
 		});

 		/**
 		 * Saves the items to 3D Cart. 
 		 * This usually happens after an inventory sync.
 		 */
 		socket.on('saveItems', function(query) {
 			cart3d.saveItems(null, function(progress, total) {
 				socket.emit('saveItemsProgress', {
 					progress: progress,
 					total: total
 				});
 			}, function(updatedItems) {
 				socket.emit('saveItemsFinished', {
 					items: updatedItems
 				});

 				// also save the options
 				cart3d.saveOptionItems(function(progress, total) {
 					socket.emit('saveOptionItemsProgress', {
 						progress: progress,
 						total: total
 					});
 				}, function(items) {
 					socket.emit('saveOptionItemsFinished', {
 						items: items
 					});
 				});
 			});

 			// save the walmart inventory
 			walmart.updateInventory();
 			// save the amazon inventory
 			amazon.updateInventory();
 		});

 		socket.on('orderRequest', function() {
 			qbws.generateOrderRequest();
 		});

 		/**
 		 * Find all the orders in 3D Cart and save them to our db
 		 */
 		socket.on('getOrders', function(data) {
 			var query = {
        limit : data.limit,
        orderstatus : data.status, // Status of New = 1
        datestart : data.startDate,
        dateend : data.endDate
      };

      if (data.number) {
      	query.invoicenumber = data.number;
      }

      console.log(query.limit);

 			cart3d.getOrders(query, qbws, function(numberOfOrders) {
 				socket.emit('getOrdersFinished', numberOfOrders);
 			});
 		});

 		/**
 		 * Load orders from 3D Cart
 		 */
 		socket.on('loadOrders', (query, site) => {
 			if (site == null) { // both US and Canadian
 				var loadUSOrders = cart3d.loadOrders(query, false);
 				var loadCAOrders = cart3d.loadOrders(query, true);
 				Promise.all([loadUSOrders, loadCAOrders]).then((responses) => {
 					var combined = responses[0].concat(responses[1]);
 					socket.emit('loadOrdersFinished', combined);
 				}).catch((err) => {
 					console.log(err);
 				});
 			} else if (site == 'US') {
 				var loadOrders = cart3d.loadOrders(query, false);
 				loadOrders.then((response) => {
 					socket.emit('loadOrdersFinished', response);
 				}).catch((err) => {
 					console.log(err);
 				});
 			} else if (site == 'CA') {
 				var loadOrders = cart3d.loadOrders(query, true);
 				loadOrders.then((response) => {
 					socket.emit('loadOrdersFinished', response);
 				});
 			}
 		});

 		socket.on('loadOrdersForManifest', (query, site) => {
 			var loadOrders = cart3d.loadOrdersForManifest(query, false);
 			loadOrders.then((orders) => {
 				console.log('loading orders for manifest finished');
 				socket.emit('loadOrdersFinished', orders);
 			});
 		});

 		/**
 		 * Get all the information on the items based on a query
 		 */
 		socket.on('getItemsFull', function(query) {
 			cart3d.getItemsFull(query, function(progress, total, items) {
 				socket.emit('getItemsProgress', progress, total, items);
 			}, function(err) {
 				socket.emit('getItemsFinished');
 			});
 		});

 		/**
 		 * Updates the items based on what was passed in
 		 */
 		socket.on('updateItems', function(cartItems, bulkUpdates) {
 			cart3d.updateItems(cartItems, bulkUpdates, function(progress, total) {
 				console.log(progress);
 			}, function(responses) {
 				socket.emit('updateItemsFinished', responses);
 			});
 		});

 		socket.on('updateAllItems', function() {
 			cart3d.updateItemsFromDB(function(progress, total) {
 				console.log((progress / total).toFixed(2));
 			}, function(responses) {
 				socket.emit('updateAllItemsFinished', responses);
 			});
 		});

 		/**
 		 * Saves all the options to 3D Cart
 		 */
 		socket.on('saveOptionsOverride', function() {
 			cart3d.saveOptionItems(true, function(progress, total) {
 				console.log((progress / total).toFixed() * 100);
 			}, function(responses) {
				socket.emit('saveOptionItemsFinished', {
					items: responses
				});
				console.log(responses);
 			});
 		});

 		/**
 		 * Get's the categories from the US website
 		 */
 		socket.on('getCategories', function() {
 			cart3d.getCategories(function(responses) {
 				socket.emit('getCategoriesFinished', responses);
 			});
 		});

 		socket.on('saveCategories', function() {
 			cart3d.saveCategories(null, function(responses) {
 				console.log('done saving categories.');
 			});
 		});

 		/**
 		 * Update quickbooks with the recent changes
 		 */
 		socket.on('saveToQuickbooks', function() {
 			cart3d.updateQuickbooks(qbws, function() {
 				socket.emit('quickbooksFinished');
 			});
 		});

 		/**
 		 * Saves the settings about inventory distribution
 		 */
 		socket.on('saveSettings', function(data) {
 			Settings.findOne({}, function(err, settings) {
 				console.log(data);
 				if (settings) {
	 				settings.canadianDistribution = (data.canada / 100);
	 				settings.usDistribution = (data.us / 100);
	 				settings.save();
	 			} else {
	 				var newSettings = new Settings();
	 				newSettings.canadianDistribution = (data.canada / 100);
	 				newSettings.usDistribution = (data.us / 100);
	 				newSettings.save();
	 			}
 				console.log('Saved settings');
 			});
 		});

 		socket.on('saveAdvancedOptions', function(items, canadian) {
 			cart3d.saveAdvancedOptions(canadian, items, function(responses) {
 				socket.emit('saveAdvancedOptionsFinished', responses);
 			}, true);
 		});

 		socket.on('searchDB', function(query) {
 			helpers.search(query, function(err, items) {
 				socket.emit('searchFinished', items);
 			});
 		});

 		socket.on('findItemsForOrder', itemList => {
 			var findItems = helpers.findItemsForOrder(itemList)
 			findItems.then(items => {
 				socket.emit('findingItemsFinished', items);
 			});
 		});

 		socket.on('searchSKU', function(sku) {
 			sku = sku.trim().toUpperCase();
 			var search = helpers.searchSKU(sku);
 			search.then(function(items) {
 				socket.emit('searchSKUFinished', items);
 			});
 		});

 		socket.on('searchCustomer', function(email) {
 			var search = helpers.searchCustomer(email);
 			search.then(function(customers) {
 				socket.emit('searchCustomerFinished', customers);
 			});
 		});

 		socket.on('searchCustomer3DCart', (email, canadian) => {
 			var findCustomer = cart3d.searchCustomer(email, canadian);
 			findCustomer.then((body, response) => {
 				socket.emit('searchCustomer3DCartFinished', null, body);
 			}).catch(err => {
 				socket.emit('searchCustomer3DCartFinished', err, null);
 			});
 		});

 		socket.on('saveCustomOrder', order => {
 			var savingOrder = cart3d.saveCustomOrder(order);
 			savingOrder.then(response => {
 				socket.emit('saveCustomOrderFinished', response);
 			});
 		});

 		/**
 		 * Updates the item in our db, qb, and 3d cart (us and can)
 		 */
 		socket.on('saveItem', function(item) {
 			cart3d.saveItem(item, qbws);
 		});

 		socket.on('bulkSaveItems', (items) => {
 			cart3d.saveItemMultiple(items, qbws);
 		});

 		socket.on('saveCustomer', function(customer) {
 			helpers.saveCustomer(customer);
 		});

 		socket.on('loadFrom3DCart', function(prefix, orderNumber) {
 			var getOrder = cart3d.getOrder({
 				invoicenumber: orderNumber
 			}, prefix == 'CA');
 			getOrder.then(response => {
 				socket.emit('receivedOrder', response);
 			});
 		});

 		socket.on('createAmazonItem', function(sku) {
 			amazon.addProducts(sku);
 		});

 		socket.on('addAmazonImage', function(sku) {
 			amazon.addProductImage(sku);
 		});

 		socket.on('updateAmazonInventory', function(sku) {
 			amazon.updateInventoryItem(sku);
 		});

 		socket.on('updateAmazonPricing', function(sku) {
 			amazon.updatePricing(sku);
 		});

 		socket.on('generateFacebookFeed', function() {
 			facebook.generateFacebookFeed(function(err) {
 				if (err) {
 					console.log(err);
 				}
 				socket.emit('facebookFeedFinished');
 			});
 		});

 		socket.on('getWalmartFeed', function(feedId) {
 			walmart.getFeedStatus(feedId);
 		});

 		socket.on('createWalmartItem', function(sku) {
 			walmart.createItem(sku);
 		});

 		socket.on('bulkCreateWalmartItem', function(manufacturerName) {
 			walmart.bulkCreateItems(manufacturerName);
 		});

 		socket.on('bulkSendWalmartItems', function(items) {
 			console.log('sending ' + items.length + ' items to walmart');
 			walmart.bulkSendItems(items);
 		});

 		socket.on('bulkSendAmazonItems', function(items) {
 			var skus = [];
 			items.forEach(function(item) {
 				skus.push(item.sku);
 			});

 			amazon.bulkAddItems(skus);
 			//amazon.bulkAddImages(skus);
 			//amazon.bulkAddPrices(skus);
 		});

 		socket.on('getWalmartItem', function(sku) {
 			walmart.getItem(sku);
 		});

 		socket.on('updateWalmartItem', function(sku) {
 			walmart.updateItem(sku);
 		});

 		socket.on('getWalmartInventory', function(sku) {
 			walmart.getInventory(sku);
 		});

 		socket.on('updateWalmartInventory', function(sku) {
 			walmart.updateInventoryItem(sku);
 		});

 		socket.on('updateAllWalmartInventory', function() {
 			walmart.updateAllInventory();
 		});

 		socket.on('updateAllAmazonInventory', function() {
 			amazon.updateAllInventory();
 		});

 		socket.on('generateVendorFile', function(query) {
 			amazon.generateVendorUploadFile(query, function() {
 				console.log('Finished');
 			});
 		});

 		socket.on('generateSellerFile', function(query) {
 			amazon.generateSellerUploadFile(query, null, function() {
 				console.log('Finished');
 			});
 		});

 		socket.on('getSettings', function() {
 			Settings.findOne({}, function(err, settings) {
 				socket.emit('getSettingsFinished', settings);
 			});
 		});

 		socket.on('calculateSubtotal', function(order) {
 			var calculating = helpers.calculateSubtotal(order);
 			calculating.then((total) => {
 				socket.emit('calculateSubtotalFinished', total);
 			});
 		});

 		socket.on('saveShowOrder', function(order) {
 			var savingOrder = cart3d.saveShowOrder(order);
 			savingOrder.then((response) => {
 				console.log('finished the promise');
 				socket.emit('saveShowOrderFinished', null, response);
 			}).catch(err => {
 				console.log('caught an error');
 				console.log(err);
 				socket.emit('saveShowOrderFinished', err, null);
 			});
 		});

 		socket.on('saveManifest', function(manifest) {
 			var savingManifest = helpers.saveManifest(manifest);
 			savingManifest.then(newManifest => {
 				socket.emit('saveManifestFinished', null, newManifest);
 			}).catch(err => {
 				console.log(err);
 				socket.emit('saveManifestFinished', err, null);
 			});
 		});

 		socket.on('deleteManifest', manifest => {
 			var removingManifest = helpers.removeManifest(manifest);
 			removingManifest.then(old => {
 				socket.emit('deleteManifestFinished');
 			})
 		});

 		socket.on('searchAddress', address => {
 			var findAddress = helpers.searchAddress(address);
 			findAddress.then(results => {
 				socket.emit('searchAddressFinished', results);
 			});
 		});

 		socket.on('saveAddress', shipmentInfo => {
 			var savingAddress = helpers.saveAddress(shipmentInfo);
 			savingAddress.then(newAddress => {
 				console.log('saved address');
 			});
 		});

 		socket.on('refreshAllItems', function() {
 			console.log('Refreshing all items');
 			cart3d.refreshFrom3DCart(function(items) {
 				helpers.queryAllItems(qbws, function() {
					console.log('Run the web connector');
	 				qbws.setFinalCallback(function() {
	 					// now we can save the items?
	 					console.log('Ready to save the items');
	 					cart3d.saveItems({}, function(progress, total) {
			 				console.log(((progress/total)*100).toFixed(2) + '%');
			 			}, function(updatedItems) {
			 				console.log('Item inventory updated, now saving the options');
			 				// also save the options
			 				cart3d.saveOptionItems(function(progress, total) {
			 					console.log(((progress/total)*100).toFixed(2) + '%');
			 				}, function(items) {
			 					console.log('All items and options updated.');
			 				});
			 			});
	 				});
 				});
 			});
 		});
 	});
 }