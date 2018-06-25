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
					addToInventoryList(item, 1); // default add 1 item
					$('#itemSKU').select();
				}
			});
		} else if (e.ctrlKey && code === 40) { // down arrow
			socket.emit('searchSKU', $('#itemSKU').val());
		}
	});

	$('#itemQuantity').on('keydown', e => {
		var code = e.keyCode || e.which;
		if (code === 13 || code === 9) {
			var newStock = parseInt($('#itemQuantity').val().trim());
			addToInventoryList(theItem, newStock);
			$('#itemQuantity').val('1');
			$('#itemSKU').select();
		}
	});

	$('#saveInventoryButton').click(e => {
		var memo = $('#notesArea').val();
		socket.emit('updateInventory', inventoryList, memo, response => {
			$('#info').text('Inventory Adjustment request sent to Quickbooks. Run the Web Connector.');
			clearFields();
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

function addToInventoryList(item, stockLevel) {
	// find the item in the list
	var newItem = true;
	for (var i of inventoryList) {
		if (i.sku == item.sku) {
			i.newStock += stockLevel;
			buildInventoryTable();
			return;
		}
	}

	// new item 
	item.newStock = stockLevel;
	inventoryList.push(item);
	buildInventoryTable();
}

function buildInventoryTable() {
	$('#inventoryTableBody').empty();

	for (var item of inventoryList) {
		var row = $('<tr></tr>');
		var sku = $('<td></td>').text(item.sku);
		var stock = $('<td></td>').text(item.newStock);

		row.append(sku);
		row.append(stock);
		$('#inventoryTableBody').append(row);
	}
}