/**
 * For use with socket.io and the api
 */
 var cart3d = require('./3dcart');

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
				socket.emit('getItemsFinished', {
					items: responses
				});
 			});
 		});

 		/**
 		 * Saves the items to 3D Cart. 
 		 * This usually happens after an inventory sync.
 		 */
 		socket.on('saveItems', function() {
 			cart3d.saveItems(function(progress, total) {
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
 	});
 }