var socket = io();
var inventoryList = [];
var theItem = {};

$(document).ready(e => {
	$('#itemSKU').on('keydown', e => {
		var code = e.keyCode || e.which;
		if (code === 13 || code === 9) { // enter or tab key
			var sku = $('#itemSKU').val().trim();
			socket.emit('searchDB', {$or: [{ sku: sku }, { barcode: sku }]}, items => {
				var item = items[0];
				theItem = item;
				if (item == null) {
					$('#itemSKU').select();
					return;
				}

				if (code === 13) {
					addToInventoryList(item, 1, true); // default add 1 item
					$('#itemSKU').select();
				} else {
					$('#itemQuantity').val(getStockLevel(item));
				}
			});
		} else if (e.ctrlKey && code === 40) { // down arrow
			console.log('searching...');
			socket.emit('searchSKU', $('#itemSKU').val(), items => {
				$('#itemList').empty();
				console.log('done');
				items.forEach(item => {
					$('#itemList').append($('<option>'+item.sku+'</option>'));
				});
			});
		}
	});

	$('#itemQuantity').on('keydown', e => {
		var code = e.keyCode || e.which;
		if (code === 13 || code === 9) {
			var newStock = parseInt($('#itemQuantity').val().trim());
			var oldStock = getStockLevel(theItem);
			var difference = newStock - oldStock;
			$('#itemDifference').val(difference);
			if (code === 13) {
				addToInventoryList(theItem, newStock, false); // set the new stock level
			}
		}
	});

	$('#itemDifference').on('keydown', e => {
		var code = e.keyCode || e.which;
		if (code === 13 || code === 9) {
			e.preventDefault();
			var difference = parseInt($('#itemDifference').val());	
			var oldStock = getStockLevel(theItem);
			addToInventoryList(theItem, difference, true);
			$('#itemDifference').val('1');
			$('#itemSKU').select();
		}
	});

	$('#browseButton').click(e => {
		e.preventDefault();
		$('#fileInput').val('');
		$('#fileInput').click();
	});

	$('#saveInventoryButton').click(e => {
		var memo = $('#notesArea').val();
		socket.emit('updateInventory', inventoryList, memo, response => {
			$('#info').text('Inventory Adjustment request sent to Quickbooks. Run the Web Connector.');
			clearFields();
		});
	});

	$('#fileInput').on('change', e => {
		console.log('file change');
		$('#info').text('Loading... Please wait.')
		$('#fileName').text(e.target.files[0].name);

		$('#fileInput').parse({
			config: {
				complete: function(results, file) {
					populateFromFile(results.data);
				},
				header: true
			},
			complete: function() {
				console.log('all files done');
			}
		});
	});
});

function clearFields() {
	$('#itemSKU').val('');
	$('#itemQuantity').val('1');
	$('#notesArea').val('');
	inventoryList = [];
	buildInventoryTable();
	theItem = {};
	setTimeout(() => {
		$('#info').text('');
	}, 3000);
}

function addToInventoryList(item, stockLevel, addTo) {
	// find the item in the list
	for (var i of inventoryList) {
		if (i.sku == item.sku) {
			if (addTo)
				i.quantityDifference += stockLevel;
			else
				i.newStock = stockLevel;
			buildInventoryTable();
			return;
		}
	}

	// new item 
	if (addTo) 
		item.quantityDifference = stockLevel;
	else
		item.newStock = stockLevel;
	inventoryList.push(item);
	buildInventoryTable();
}

function buildInventoryTable() {
	$('#inventoryTableBody').empty();

	for (var item of inventoryList) {
		var row = $('<tr></tr>');
		var sku = $('<td></td>').text(item.sku);
		var stock = $('<td></td>');
		var difference = $('<td></td>');

		if (item.newStock) {
			stock.text(item.newStock);
			difference.text(item.stock - item.newStock);
		}
		if (item.quantityDifference) {
			stock.text(item.stock + item.quantityDifference);
			differnece.text(item.quantityDifference);
		}

		row.append(sku);
		row.append(stock);
		$('#inventoryTableBody').append(row);
	}
}

function getStockLevel(item) {
	for (let i of inventoryList) {
		if (i.sku == item.sku) {
			return parseInt(i.newStock);
		}
	}
	return parseInt(item.stock);
}

function loadFromFile(data) {
	$('#messages').empty();
	data = data.filter(i => (i.upc != '' || i.sku != ''));
	console.log(data);

	// data should contain a list of upc codes
	// go through the upc codes and count up the total items
	var counts = {};
	data.forEach(item => {
		if (item.upc != '') {
			if (counts.hasOwnProperty(item.upc)) {
				if (item.stock && item.stock != '') {
					var stockToAdd = parseInt(item.stock);
					counts[item.upc] += stockToAdd;
				} else {
					counts[item.upc]++;
				}
			} else {
				if (item.stock && item.stock != '') {
					counts[item.upc] = parseInt(item.stock);
				} else {
					counts[item.upc] = 1;
				}
			}
		} else if (item.sku != '') {
			if (counts.hasOwnProperty(item.sku)) {
				if (item.stock && item.stock != '') {
					var stockToAdd = parseInt(item.stock);
					counts[item.sku] += stockToAdd;
				} else {
					counts[item.sku]++
				}
			} else {
				if (item.stock && item.stock != '') {
					counts[item.sku] = parseInt(item.stock);
				} else {
					counts[item.sku] = 1;
				}
			}
		}
	});

	for (let upc of Object.keys(counts)) {
		socket.emit('searchDB', { $or: [{ barcode: upc }, { sku: upc }] }, items => {
			var theItem = items[0];
			if (theItem == null) {
				var message = 'Barcode or SKU: ' + upc + ' not found. Count: ' + counts[upc];
				$('#messages').append($('<li>' + message + '</li>'))
			} else {
				addToInventoryList(theItem, counts[upc], true);
			}
		});
	}
}

function populateFromFile(data) {
	var restocks = {};
	$('#messages').empty();

	data = data.filter(i => i.id != '');

	// massage the data so we have a bunch of unique identifiers and corresponding counts
	data.forEach(item => {
		if (restocks.hasOwnProperty(item.id)) {
			if (item.count && item.count != '') {
				restocks[item.id] += parseInt(item.count);
			} else {
				restocks[item.id] ++;
			}
		} else {
			if (item.count && item.count != '') {
				restocks[item.id] = parseInt(item.count);
			} else {
				restocks[item.id] = 1;
			}
		}
	});

	var ids = Object.keys(restocks);
	console.log('doing request');
	console.log(ids.length);
	// just one request to the database
	socket.emit('searchDB', { 
		$or: [{ 
			barcode: {
				$in: ids
			}
		}, {
			sku: {
				$in: ids
			}
		}]
	}, items => {
		$('#info').text('');
		console.log(items.length);
		items.forEach(item => {
			var stockToAdd = restocks[item.barcode] || restocks[item.sku];
			if (stockToAdd) {
				addToInventoryList(item, stockToAdd, true);
			}
		});

		// check which items weren't found
		for (let id of ids) {
			var exists = false;
			for (let item of items) {
				if (item.sku == id || item.barcode == id) {
					exists = true;
					break;
				}
			}
			if (!exists) {
				// this item wasn't found
				var message = 'Barcode or SKU: ' + id + ' not found. Count: ' + restocks[id];
				$('#messages').append($('<li>' + message + '</li>'))
			}
		}
	});
}