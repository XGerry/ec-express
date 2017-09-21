/**
 * For use with socket.io and the api
 */
 var cart3d = require('./3dcart');
 var amazon = require('./amazon');
 var facebook = require('./facebook');
 var helpers = require('./helpers');
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
 			}, function(responses) {
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
 		});

 		/**
 		 * Find all the orders in 3D Cart and save them to our db
 		 */
 		socket.on('getOrders', function(data) {
 			var query = {
        limit : 200, // always 200
        orderstatus : data.status, // Status of New = 1
        datestart : data.startDate,
        dateend : data.endDate,
        invoicenumber : data.number
      };

 			cart3d.getOrders(query, qbws, function(orders) {
 				socket.emit('getOrdersFinished', orders);
 			});
 		});

 		/**
 		 * Get all the information on the items based on a query
 		 */
 		socket.on('getItemsFull', function(query) {
 			cart3d.getItemsFull(query, function(progress, total, items) {
 				socket.emit('getItemsProgress', progress, total, items);
 				console.log('progress');
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
 				settings.canadianDistribution = (data.canada / 100);
 				settings.usDistribution = (data.us / 100);
 				settings.save();
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

 		/**
 		 * Updates the item in our db, qb, and 3d cart (us and can)
 		 */
 		socket.on('saveItem', function(item) {
 			cart3d.saveItem(item, qbws);
 		});

 		socket.on('sendProductsToAmazon', function() {
 			amazon.addProducts(function(response) {
 				// do something here.
 			});
 		});

 		socket.on('generateFacebookFeed', function() {
 			facebook.generateFacebookFeed(function(err) {
 				if (err) {
 					console.log(err);
 				}
 				socket.emit('facebookFeedFinished');
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
 		})
 	});
 }