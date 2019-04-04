/**
 * For use with socket.io and the api
 */
 var cart3d = require('./3dcart');
 var amazon = require('./amazon');
 var facebook = require('./facebook');
 var reporting = require('./reporting');
 var helpers = require('./helpers');
 var walmart = require('./walmart');
 var Settings = require('./model/settings');
 var CustomOrder = require('./model/customOrder');
 var Marketplace = require('./model/marketplace');
 var Item = require('./model/item');
 var Batch = require('./model/batch');
 var Order = require('./model/order');
 var Customer = require('./model/customer');
 const fs = require('fs');
 var path = require('path');

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
 			}).then((responses) => {
 				console.log(responses);
 				helpers.queryAllItems(qbws).then(() => {
					socket.emit('getItemsFinished');
 				});
 			});
 		});

 		socket.on('updateFromQB', () => {
 			helpers.queryAllItems(qbws).then(() => {
 				console.log('run the web connector');
 			});
 		});

 		socket.on('syncInventoryAndOrders', async () => {
 			qbws.addStartingCallback(() => {
 				socket.emit('webConnectorStarted');
 				return Promise.resolve('Started!');
 			});

 			// First get the New orders from 3D Cart
 			let marketplaces = await Marketplace.find({});
 			let settings = await Settings.findOne({});
 			let promises = [];
 			helpers.setTimeCode();
 			settings.lastImport = helpers.getTimeCode();
 			settings.lastImports = [helpers.getTimeCode()];
 			await settings.save();
 			marketplaces.forEach(market => {
 				promises.push(market.importOrders(helpers.getTimeCode()));
 			});

 			Promise.all(promises).then(numberOfOrders => {
 				helpers.generateSalesOrders(qbws);
 				socket.emit('getOrdersFinished', numberOfOrders);
 				// Now, refresh the stock levels in 3D Cart
 				let promises = [];
 				marketplaces.forEach(market => {
 					promises.push(market.getSKUInfos());
 				});

 				Promise.all(promises).then(async () => {
 					await helpers.runInventory(qbws);
 					qbws.addFinalCallback(() => {
						socket.emit('webConnectorFinished');
						saveInventory().then(() => {
							console.log('Saving inventory');
						});
						return Promise.resolve('Finished');
					});
					socket.emit('getItemsFinished');
					// Now we need to run the web connector
 				});
 			});
 		});

 		async function saveInventory() {
 			// save the walmart inventory
 			let promises = [];
 			promises.push(walmart.updateInventory());

 			// save the amazon inventory
 			promises.push(amazon.updateInventory());

 			let marketplaces = await Marketplace.find({});
 			marketplaces.forEach(market => {
 				promises.push(market.updateInventory());
 			});

 			return Promise.all(promises).then(async () => {
        let updatedItems = await Item.find({updated:true});
        helpers.inventoryBot({
          text: updatedItems.length + ' items were synced with 3D Cart.'
        });
      });
 		}

 		/**
 		 * Saves the items to 3D Cart. 
 		 * This usually happens after an inventory sync.
 		 */
 		socket.on('saveItems', function() {
 			saveInventory();
 		});

 		socket.on('orderRequest', function() {
 			helpers.createInvoiceRequests(qbws);
 		});

 		socket.on('createInvoice', order => {
 			helpers.createInvoiceFromSalesOrder(qbws, order);
 		});

 		socket.on('saveOrder', order => {
 			cart3d.invoiceOrder(order).then(response => {
 				console.log(response);
 			});
 		});

 		/**
 		 * Find all the orders in 3D Cart and save them to our db
 		 */
 		socket.on('getOrders', async function(data) {
 			let marketplaces = await Marketplace.find({});
 			let promises = [];
 			helpers.setTimeCode();
 			marketplaces.forEach(market => {
 				promises.push(market.importOrders(helpers.getTimeCode()));
 			});
 			helpers.generateSalesOrders(qbws);
 		});

 		socket.on('closeSalesOrder', (orderId, cb) => {
 			helpers.closeSalesOrder(qbws, orderId);
 			cb('Run the web connector');
 		});

 		/**
 		 * Load orders from 3D Cart
 		 */
 		socket.on('loadOrders', (query, site, callback) => {
 			if (site == null) { // both US and Canadian
 				var loadUSOrders = cart3d.loadOrders(query, false);
 				var loadCAOrders = cart3d.loadOrders(query, true);
 				Promise.all([loadUSOrders, loadCAOrders]).then((responses) => {
 					var combined = responses[0].concat(responses[1]);
 					socket.emit('loadOrdersFinished', combined);
 					if (callback)
 						callback(combined);
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
 			cart3d.getItemsFull(query, (progress, total, items) => {
 				socket.emit('getItemsProgress', progress, total, items);
 			}, query.canadian).then(response => {
 				console.log('done');
 				socket.emit('getItemsFinished');
 			});
 		});

 		socket.on('updateAllItems', function() {
 			cart3d.updateItemsFromDB(function(progress, total) {
 			}, function(responses) {
 				socket.emit('updateAllItemsFinished', responses);
 			});
 		});

 		/**
 		 * Saves all the options to 3D Cart
 		 */
 		socket.on('saveOptionsOverride', function() {
 			cart3d.saveOptionItems(true, function(progress, total) {
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
 			cart3d.updateQuickbooks(qbws).then(() => {
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

 		socket.on('searchDB', function(query, callback) {
 			helpers.search(query, function(err, items) {
 				if (callback) {
 					callback(items);
 				} else {
 					socket.emit('searchFinished', items);
 				}
 			});
 		});

 		socket.on('findItemsForOrder', itemList => {
 			var findItems = helpers.findItemsForOrder(itemList)
 			findItems.then(items => {
 				socket.emit('findingItemsFinished', items);
 			});
 		});

 		socket.on('searchSKU', function(sku, cb) {
 			sku = sku.trim().toUpperCase();
 			var search = helpers.searchSKU(sku);
 			search.then(function(items) {
 				if (cb) {
 					cb(items);
 				} else {
 					socket.emit('searchSKUFinished', items);
 				}
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

 		socket.on('saveCustomOrder', (order, saveToSite, cb) => {
 			console.log('saving custom order');
 			var savingOrder = cart3d.saveCustomOrder(order, saveToSite);
 			savingOrder.then(response => {
 				if (cb)
 					cb({order: response});
 			}).catch(err => {
 				console.log(err);
 				if (cb)
 					cb({error: err.message});
 			});
 		});

 		socket.on('deleteCustomOrder', order => {
 			CustomOrder.remove({_id: order._id}).then(() => {
 				socket.emit('deleteCustomOrderFinished');
 			});
 		});

 		/**
 		 * Updates the item in our db, qb, and 3d cart (us and can)
 		 */
 		socket.on('saveItem', function(item, adjustInventory, cb) {
 			cart3d.saveItem(item, qbws, adjustInventory).then(responses => {
 				if (cb) {
 					cb(responses);
 				}
 			});
 		});

 		socket.on('bulkSaveItems', (items, cb) => {
 			cart3d.saveItemMultiple(items, qbws).then(responses => {
 				if (cb)
 					cb(responses);
 			});
 		});

 		socket.on('saveCustomer', function(customer, cb) {
 			Customer.findOne({_id: customer._id}).then(dbCustomer => {
 				dbCustomer.set(customer);
 				dbCustomer.save().then(savedCustomer => {
 					cb(savedCustomer);
 				});
 			});
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
 			amazon.addProducts(sku).then(response => {
 				console.log(response);
 				amazon.addProductImage(sku).then(response => {
 					console.log(response);
 					amazon.updatePricing(sku).then(response => {
 						console.log(response);
	 					amazon.updateInventoryItem(sku).then(response => {
	 						console.log(response);
	 					});
 					});
 				});
 			});
 		});

 		socket.on('listAmazonItem', sku => {
 			amazon.listItem(sku).then(ids => console.log(ids));
 		});

 		socket.on('addAmazonImage', function(sku) {
 			amazon.addProductImage(sku).then(response => {
 				console.log(response);
 			});
 		});

 		socket.on('updateAmazonInventory', function(sku) {
 			amazon.updateInventoryItem(sku).then(response => {
 				console.log(response);
 			});
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

 			amazon.bulkAddItems(skus).then(response => {
 				console.log(response);
	 			amazon.bulkAddPrices(skus).then(response => {
 					console.log(response);
	 				amazon.bulkAddInventory(skus).then(response => {
 						console.log(response);
	 				});
	 			});
 			});
 			//amazon.bulkAddImages(skus);
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
 			walmart.updateInventoryItem(sku).then(response => console.log(response));
 		});

 		socket.on('updateAllWalmartInventory', function() {
 			walmart.updateAllInventory().then(response => console.log(response));
 		});

 		socket.on('updateAllAmazonInventory', function() {
 			amazon.updateAllInventory().then(response => {
 				console.log(response);
 			});
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

 		socket.on('moveOrders', (from, to, website) => {
 			var moveOrders = cart3d.moveOrders(from, to, website == 'can');
 		});

 		socket.on('calculateBaseItemStock', () => {
 			var calculateStock = cart3d.calculateBaseItemStock();
 		});

 		socket.on('refreshAllItems', function() {
 			console.log('Refreshing all items');
 			cart3d.refreshFrom3DCart().then(items => {
 				console.log('Done the refresh');
 			});
 		});

 		socket.on('getManufacturers', canadian => {
 			cart3d.getManufacturers(canadian).then(response => {
 				socket.emit('getManufacturersFinished', response);
 			});
 		});

 		socket.on('saveDelivery', (delivery, callback) => {
 			helpers.saveDelivery(delivery).then(savedDelivery => {
 				callback(savedDelivery);
 			});
 		});

 		socket.on('savePO', (po, callback) => {
 			helpers.savePO(po).then(savedPO => {
 				console.log(po);
 				console.log(callback);
 				callback(savedPO);
 			});
 		});

 		socket.on('getDeliveries', callback => {
 			helpers.getDeliveries().then(deliveries => {
 				callback(deliveries);
 			});
 		});

 		socket.on('removeDelivery', (delivery, callback) => {
 			helpers.removeDelivery(delivery).then(d => { callback(d); });
 		}); 

 		socket.on('createLabels', (items, cb) => {
			var labelFile = '';

			items.forEach(item => {
				var line = item.sku + ',' + item.barcode + '\n';
				line.trim();
				labelFile += line;
			});

			fs.writeFile(path.join(__dirname, '../downloads/product-labels.csv'), labelFile, err => {
				if (err) throw err;
				console.log('Done');
				cb('Done!');
			});
 		});

 		socket.on('updateInventory', (items, memo, cb) => {
 			var request = helpers.modifyItemsInventoryRq(items, memo);
 			qbws.addRequest(request, () => {
 				console.log('updated the inventory');
 			});

 			var promises = [];

 			items.forEach(item => {
 				Item.findOne({sku: item.sku}).then(i => {
 					if (i) {
	 					if (item.newStock)
	 						i.stock = item.newStock;
	 					else if (item.quantityDifference) {
	 						i.stock += item.quantityDifference;
	 					}
	 					promises.push(i.save());
 					} else {
 						console.log('Can not find item: ');
 						console.log(item);
 					}
 				});
 			});

 			Promise.all(promises).then(responses => {
 				cb();
 			});
 		});

 		socket.on('findInQuickbooks', (skus, cb) => {
 			console.log('finding some items in quickbooks');
 			helpers.findInQuickbooks(skus, qbws).then(response => {
 				cb(response);
 			});
 		});

 		socket.on('createItems', (items, cb) => {
 			cart3d.createItems(items).then(responses => {
 				cb(responses);
 			});

 			items.forEach(item => {
 				qbws.addRequest(helpers.createItemRq(item));
 			});
 		});

 		socket.on('createItemsIn3DCart', (items, cb) => {
 			cart3d.createItems(items).then(responses => {
 				cb(responses);
 			});
 		});

 		socket.on('createItemsInQuickbooks', (items, cb) => {
 			items.forEach(item => {
 				qbws.addRequest(helpers.createItemRq(item));
 			});
 		});

 		socket.on('updatePricingInQB', (canadian) => {
 			Item.find({}).limit(100).skip(100).then(items => {
 				items.forEach(item => {
 					helpers.saveItem(item, qbws, false, canadian);
 				});
 				console.log('Waiting for Web Connector.');
 			});
 		});

 		socket.on('saveItemLocations', (items, location, primary) => {
 			console.log('saving items');
 			Item.find({
 				$or: [{
	 				barcode: {
	 					$in: items
	 				}
 				}, {
 					sku: {
	 					$in: items
	 				}
 				}]
 			}).then(items => {
 				items.forEach(item => {
 					if (primary) {
 						item.location = location;
 					} else {
 						item.secondLocation = location;
 					}
 					cart3d.saveItem(item, qbws);
 				});
 			});
 		});

 		socket.on('getUnpaidOrderReport', (startDate, endDate) => {
 			reporting.getUnpaidOrders(startDate, endDate, (orders, progress) => {
 				socket.emit('receivedUnpaidOrders', orders, progress);
 			});
 		});

 		socket.on('getAutoBatch', (batchType, cb) => {
 			Batch.createAutoBatch(200, 35, batchType).then(batch => {
 				cb(batch);
 			});
 		});

 		socket.on('getCustomBatch', (ids, cb) => {
 			Batch.createCustomBatch(ids).then(batch => {
 				cb(batch);
 			});
 		});

 		socket.on('createCustomOrder', (customOrder, cb) => {
 			Order.createCustomOrder(customOrder).then(order => {
 				console.log(order);
 				cb(order);
 			});
 		});

 		socket.on('finishBatch', (batch, cb) => {
 			Batch.findOne({_id: batch._id}).populate('orders').then(dbBatch => {
				dbBatch.finish(batch).then(savedBatch => {
					cb(savedBatch);
				});
 			});
 		});

 		socket.on('resetBatch', (batchId, cb) => {
 			Batch.findOne({_id: batchId}).then(batch => {
 				batch.reset().then(() => {
 					cb();
 				});
 			});
 		});

 		socket.on('saveBatch', (batch, cb) => {
 			Batch.findOne({_id: batch._id}).populate('orders').then(async dbBatch => {
 				await dbBatch.updatePickedQuantities(batch);
 				cb();
 			});
 		});

 		socket.on('updateOrder', (order, cb) => {
 			Order.findOne({_id: order._id}).populate('items.item').then(dbOrder => {
 				dbOrder.updateOrder(order).then(response => {
 					cb(response);
 				});
 			});
 		});

 		socket.on('updateOrderQB', (id, cb) => {
 			Order.findOne({_id: id}).populate('items.item').then(order => {
 				if (order) {
 					helpers.updateSalesOrder(order, qbws);
 					cb('Sent to QB. Wait for the Web Connector to run.')
 				} else {
 					cb('Order not found.');
 				}
 			});
 		});

 		socket.on('invoiceBatch', (id, cb) => {
 			loadBatch(id).then(batch => {
 				var ordersToInvoice = batch.orders.filter(o => !o.hold);
 				helpers.createInvoicesFromSalesOrders(qbws, ordersToInvoice);
 				ordersToInvoice.forEach(order => {
 					try {
 						order.invoiceTo3DCart();
 					} catch (err) {
 						console.log('Error trying to invoice order: ' + order.orderId);
 						console.log(err);
 					}
 				});
 				cb('Invoice request generated!');
 			});
 		});

 		socket.on('invoiceOrder', (id, cb) => {
 			Order.findOne({_id: id}).populate('items.item').populate('parent originalOrder').then(order => {
 				if (order.isCartOrder) {
 					order.invoiceTo3DCart();
 				}
 				helpers.createInvoicesFromSalesOrders(qbws, [order]);
 				cb('Run the web connector!');
 			});
 		});

 		socket.on('removeOrderFromBatch', (id, cb) => {
 			Order.findOne({_id: id}).then(order => {
 				order.removeBatch().then(o => {
 					cb('done');
 				});
 			});
 		});

 		socket.on('autoInvoiceOrders', cb => {
 			Order.find({picked: true, invoiced: false}).populate('items.item').then(orders => {
 				helpers.createInvoicesFromSalesOrders(qbws, orders);
 				cb('Requests have been generated!');
 			});
 		});

 		socket.on('deleteOrder', (id, cb) => {
 			Order.findOne({_id: id}).then(async order => {
 				if (order.isCartOrder) {
 					await order.updateOrderStatus(5);
 				}
 				if (order.imported) {
 					helpers.closeSalesOrder(qbws, order.orderId);
 				}
	 			Order.remove({_id: id}).then(res => {
	 				cb(res);
	 			});
 			});
 		});

 		socket.on('deleteBatch', (id, cb) => {
 			Batch.findOne({_id: id}).then(batch => {
 				if (batch) {
 					batch.delete().then(() => {
 						cb();
 					});
 				} else {
 					cb();
 				}
 			});
 		});

 		socket.on('crossCheckUnpaidOrders', cb => {
 			helpers.checkUnpaidOrders(qbws);
 			cb();
 		});

 		socket.on('crossCheckUninvoicedOrders', cb => {
 			helpers.checkUninvoicedOrders(qbws);
 			cb();
 		});

 		socket.on('transferInventory', (inventoryTransfer, cb) => {
 			helpers.transferInventory(inventoryTransfer, qbws);
 			cb('Run the web connector!');
 		});

 		socket.on('refreshItem', (item, cb) => {
 			Item.findOne({_id: item._id}).then(dbItem => {
 				dbItem.refreshFrom3DCart().then(item => {
 					cb();
 				});
 			});
 		});

 		socket.on('refreshOrder', (id, cb) => {
 			Order.findOne({_id: id}).then(order => {
 				order.updateFrom3DCart(order.cartOrder).then(() => {
 					cb();
 				});
 			}); 
 		});

 		socket.on('runInventory', () => {
 			helpers.runInventory(qbws);
 		});

 		socket.on('createBackorder', (orderId, cb) => {
 			Order.findOne({_id: orderId}).then(order => {
 				order.createBackorder().then(o => {
 					cb();
 				});
 			});
 		});

 		socket.on('calculateSalesMetrics', (theItem, cb) => {
 			Item.findOne({_id: theItem._id}).then(item => {
 				item.calculateSalesMetrics().then(item => {
 					cb(item);
 				});
 			});
 		});

 		socket.on('calculateProfit', (orderId, cb) => {
 			Order.findOne({_id: orderId}).then(order => {
 				if (order) {
	 				order.calculateProfit().then((order) => {
	 					cb(order);
	 				}).catch(err => {
	 					console.log('Problem calculating profit')
	 				});
 				}
 			});
 		});

 		socket.on('importCustomers', (data, cb) => {
 			data.forEach(customer => {
 				var req = helpers.importCustomerRq(customer);
 				console.log(req);
 				qbws.addRequest(req);
 			});
 			cb();
 		});

 		socket.on('createPO', (data, site, cb) => {
 			var req = helpers.createPORq(data, site);
 			console.log(req);
 			qbws.addRequest(req);
 		});

 		function loadBatch(id) {
	    return Batch.findOne({_id: id}).populate({
	      path: 'orders',
	      model: 'Order',
	      populate: {
	        path: 'items.item',
	        model: 'Item'
	      }
	    });
	  }
 	});
 }