var socket = io();

var theItem = {};
var allItems = [];
var selectedItems = [];
var putAwayMode = false;
var lastQuery = '';
var inputTimer;
var putAwayItem = undefined;

var queries = {
	$eq: [],
	$gt: [],
	$lt: []
};

function getQuery() {
	var sku = $('#sku').val().trim().toUpperCase();
	var pattern = '^'+sku;

	var query = {
		sku: {
			$regex: pattern,
			$options: 'gi'
		},
		manufacturerName: $('#manufacturer').val(),
		catalogId: $('#catalogId').val(),
		updated: $('#updated').is(':checked'),
		isOption: $('#isOption').is(':checked'),
		hasOptions: $('#hasOptions').is(':checked'),
		catalogIdCan: $('#catalogIdCan').val(),
		location: $('#warehouseLocation').val(),
		barcode: $('#barcodeSearch').val()
	};

	if (query.sku == '') {
		delete query.sku;
	}
	if (query.manufacturerName == '') {
		delete query.manufacturerName;
	}
	if (query.catalogId == '') {
		delete query.catalogId;
	}
	if (query.catalogIdCan == '') {
		delete query.catalogIdCan;
	}
	if (query.updated == false) {
		delete query.updated;
	}
	if (query.isOption == false) {
		delete query.isOption;
	}
	if (query.hasOptions == false) {
		delete query.hasOptions;
	}

	if (query.location == '') {
		delete query.location;
	}

	if (query.barcode == '') {
		delete query.barcode;
	}

	return query;
}

$(document).ready(function() {
	$('#databaseTable').DataTable({
		bDestroy: true,
		pageLength: 100,
		order: [[1, 'asc']],
		columnDefs: [{
			targets: 'no-sort',
			orderable: false
		}]
	});

	socket.emit('getSettings');

	$('#advancedButton').click(function(e) {
		$(this).toggleClass('active');
	});

	$('#searchButton').click(function(e) {
		lastQuery = getQuery();
		socket.emit('searchDB', lastQuery);
		allItems = [];

	});

	$('#putAwayMode').click(e => {
		if (e.target.checked) {
			putAwayMode = true;
		} else {
			putAwayMode = false;
		}
	});

	// update stock automatically
	$('#stock').change(function() {
		var totalStock = $('#stock').val();
		$('#usStock').val(totalStock);
		$('#canStock').val(totalStock);
	});

	// calculate sale prices automatically
	$('#salePercentage').change(function() {
		var salePercentage = $('#salePercentage').val() / 100;
		var usOff = (salePercentage*theItem.usPrice);
		var canOff = (salePercentage*theItem.canPrice);
		$('#usSalePrice').val((theItem.usPrice - usOff).toFixed(2));
		$('#canSalePrice').val((theItem.canPrice - canOff).toFixed(2));
	});

	$('#selectAll').click(function(e) {
		if (this.checked) {
			selectedItems = allItems;
			$('.selectable').each(function(index, element) {
				$(this).prop('checked', true);
			});
		} else {
			selectedItems = [];
			$('.selectable').each(function(index, element) {
				$(this).prop('checked', false);
			});
		}
	});

	$('#andQuery').click(function(e) {
		// add the query to the and part
		var value = $('#valueInput').val();
		if (value == '') {
			return; // don't do anything
		}

		var operator = $('#operator').val();
		var field = $('#fieldSelect').val();

		console.log(field + ' ' + operator + ' ' + value);
	});

	$('#sendProductsToWalmart').click(function() {
		console.log('sending items');
		socket.emit('bulkSendWalmartItems', selectedItems);
	});

	$('#sendProductsToAmazon').click(function() {
		socket.emit('bulkSendAmazonItems', selectedItems);
	});

	$('#saveItemButton').click(function(e) {
		saveItem(theItem);
	});

	$('#hideUnhide').click(function(e) {
		hideUnhide(theItem);
	});

	$('#sku').on('input propertychange', function(e) {
		if (inputTimer) {
			clearTimeout(inputTimer);
		}
		var sku = $('#sku').val();

		inputTimer = setTimeout(() => {
			socket.emit('searchSKU', sku, (items) => {
				$('#items').empty();
				items.forEach(item => {
					$('#items').append('<option>'+item.sku+'</option>');
				});
			});
		}, 500);
	});

	$('.enterKeySearch').on('keyup', function(e) {
		if (e.keyCode == 13 || e.which == 13) {
			lastQuery = getQuery();
			socket.emit('searchDB', lastQuery);
		}
	});

	$('.enterKeySaveItem').on('keyup', function(e) {
		if (e.keyCode == 13 || e.which == 13) {
			saveItem(theItem);
		}
	});

	$('#hideProductsButton').click(() => {
		selectedItems.forEach((item) => {
			item.hidden = true;
		});
		socket.emit('bulkSaveItems', selectedItems);
	});

	$('#unhideProductsButton').click(() => {
		selectedItems.forEach((item) => {
			item.hidden = false;
		});
		socket.emit('bulkSaveItems', selectedItems);
	});

	$('#createLabelsButton').click(e => {
		socket.emit('createLabels', selectedItems, () => {
			alert('Finished. Click the Download Labels button!');
		});
	});

	$('#putAwaySKU').on('keydown', e => {
		var code = e.keyCode || e.which;
		if (code == 13 || code == 9) {
			findPutAwayItem(item => {
				putAwayItem = item;
				console.log(putAwayItem);
				if (putAwayItem != undefined) {
					$('#putAwayPrimaryOrSecondary').select();
					$('#putAwayInfo').text('Item found.');
				} else {
					$('#putAwayInfo').text('No item found.');
				}
			});
		}
	});

	$('#putAwaySKU').focusout(e => {
		if (putAwayItem == undefined) {
			findPutAwayItem(item => {
				putAwayItem = item;
				if (item == undefined) {
					$('#putAwayInfo').text('No item found.');
				} else {
					$('#putAwayInfo').text('Item found.');
				}
			});
		}
	});

	$('#putAwayPrimaryOrSecondary').on('keyup', e => {
		if (e.keyCode == 13 || e.which) {
			// automatically save the item and clear the fields
			var location = $('#putAwayPrimaryOrSecondary').val();
			var primaryOrSecondary = $('input[name=locationType]:checked').val();
			primaryOrSecondary = primaryOrSecondary == 'primary';

			if (primaryOrSecondary && putAwayItem) {
				putAwayItem.location = location;
			} else if (putAwayItem) {
				putAwayItem.secondLocation = location;
			}

			socket.emit('saveItem', putAwayItem, false, responses => {
				$('#putAwayInfo').text('Saved the item.');
				putAwayItem = undefined;
			});

			putAwayItem = undefined;
			$('#putAwaySKU').select();
			$('#putAwayPrimaryOrSecondary').val('');
		}
	});

	$('#downloadFileButton').click(e => {
		var file = 'sku,name,barcode,stock,price_us_retail,cost\r\n';
		selectedItems.forEach(item => {
			var line = item.sku + ',';
			line += '"' + item.name + '",';
			line += item.barcode + ',';
			line += item.stock + ',';
			line += item.usPrice + ',';
			line += item.cost + '\r\n';
			file += line;
		});

		var blob = new Blob([file], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    var url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = "items.csv";
    a.click();
    window.URL.revokeObjectURL(url);
	});

	$('#zeroQuantitiesButton').click(e => {
		selectedItems.forEach(item => {
			item.stock = 0;
			item.usStock = 0;
			item.canStock = 0;
		});

		socket.emit('bulkSaveItems', selectedItems, (responses) => {
			socket.emit('searchDB', lastQuery, items => {
				refreshTable(items);
			});
		});

	});

	$('#savePutAwayModal').click(e => {
		// save the item first
		var location = $('#putAwayPrimaryOrSecondary').val();

		// save the location
		var itemsOrLocations = $('#putAwayItems').val();
		var items = itemsOrLocations.split('\n');
		items = items.filter(i => i != '');
		var location = $('#putAwayLocation').val();
		var primaryOrSecondary = $('input[name=locationType]:checked').val();
		primaryOrSecondary = primaryOrSecondary == 'primary';
		if (items.length > 0 && location != '') {
			socket.emit('saveItemLocations', items, location, primaryOrSecondary);
		}

		if (primaryOrSecondary && putAwayItem) {
			putAwayItem.location = location;
		} else if (putAwayItem) {
			putAwayItem.secondLocation = location;
		}

		if (putAwayItem) {
			socket.emit('saveItem', putAwayItem, false, responses => {
				$('#putAwaySKU').select();
				$('#putAwayPrimaryOrSecondary').val('');
			});
		}

		// clear the fields
		$('#putAwayItems').val('');
		$('#putAwayLocation').val('');
		$('#putAwayInfo').text('');
		putAwayItem = undefined;
	});
});

$(document).keyup(e => {
	if (e.keyCode == 66 || e.which == 66) { // b key
		// highlight the barcode field
		//$('#barcodeSearch').target();
		//$('#barcodeSearch').select();
	} else if (e.keyCode == 76 || e.which == 76) {
		//$('#warehouseLocation').select();
	}
});

function refreshTable(items) {
	$('#databaseTable').dataTable().fnDestroy();
	$('#databaseTableBody').empty();
	buildItemTable(items);
	allItems = items;
}

function findPutAwayItem(cb) {
	var skuOrBarcode = $('#putAwaySKU').val();
	if (skuOrBarcode != '') {
		socket.emit('searchDB', {
			$or: [{
				sku: skuOrBarcode
			}, {
				barcode: skuOrBarcode
			}]
		}, items => {
			cb(items[0]);
		});
	} else {
		cb(null);
	}
}

socket.on('searchFinished', function(data) {
	console.log(data);
	selectedItems = [];
	$('#databaseTable').dataTable().fnDestroy();
	$('#databaseTableBody').empty();
	buildItemTable(data);
	allItems = data;
});

socket.on('getSettingsFinished', function(data) {
	console.log(data);
	usDistribution = data.usDistribution;
	canDistribution = data.canadianDistribution;
});

function checkItemSelected(item, checkbox) {
	if ($.inArray(item, selectedItems) > -1) {
		checkbox.prop('checked', true);
	} else {
		checkbox.prop('checked', false);
	}
}

function buildItemTable(items) {
	items.forEach(function(item) {
		var row = $('<tr></tr>');
		var checkboxCol = $('<td class="text-center"></td>');
		var checkbox = $('<input type="checkbox" class="lg-box selectable">')
		checkboxCol.append(checkbox);

		checkItemSelected(item, checkbox);
		$('#databaseTable').on('draw.dt', function() {
			checkItemSelected(item, checkbox);
		});

		var sku = $('<td></td>').text(item.sku+'');
		var name = $('<td></td>').text(item.name+'');
		var americanPrice = '-';
		if (item.usPrice) {
			americanPrice = item.usPrice.toFixed(2);
		}
		var canadaPrice = '-';
		if (item.canPrice != undefined) {
			canadaPrice = '$'+item.canPrice.toFixed(2);
		}

		var usPrice = $('<td></td>').text('$'+americanPrice);
		var canPrice = $('<td></td>').text(canadaPrice);
		var stock = $('<td></td>').text(item.stock+'');
		var location = $('<td></td>').text(item.location);
		var barcodeCol = $('<td></td>').text(item.barcode);
		var hidden = $('<td></td>').text(item.hidden === true);

		row.append(checkboxCol);
		row.append(sku);
		row.append(name);
		row.append(usPrice);
		row.append(location);
		row.append(barcodeCol);
		row.append(stock);
		row.append(hidden);

		checkbox.click(function(e) {
			if (this.checked) {
				selectedItems.push(item);
			} else {
				selectedItems.splice($.inArray(item, selectedItems), 1);
			}
		});

		row.click(function(e) {
			if (e.target.type == 'checkbox') {
				return;
			}
			theItem = item;
			$('#itemNameTitle').text(item.name);
			$('#itemSKU').val(item.sku);
			$('#itemName').val(item.name);
			if (item.usPrice)
				$('#usPrice').val(item.usPrice.toFixed(2));

			if (item.canPrice != undefined) {
				$('#canPrice').val(item.canPrice.toFixed(2));
			}
			if (item.usSalePrice != undefined) {
				$('#usSalePrice').val(item.usSalePrice.toFixed(2));
			} else {
				$('#usSalePrice').val(0.00);
			}
			if (item.canSalePrice != undefined) {
				$('#canSalePrice').val(item.canSalePrice.toFixed(2));
			} else {
				$('#canSalePrice').val(0.00);
			}
			if (item.cost != undefined) {
				$('#itemCost').val(item.cost.toFixed(2));
			} else {
				$('#itemCost').val(0.00);
			}

			$('#itemImage').attr('src', 'https://ecstasycrafts.com/'+item.imageURL);
			$('#stock').val(item.stock);
			$('#usStock').val(item.usStock);
			$('#canStock').val(item.canStock);
			$('#location').val(item.location);
			$('#secondLocation').val(item.secondLocation);
			$('#barcode').val(item.barcode);
			$('#country').val(item.countryOfOrigin);
			$('#itemInactive').prop('checked', item.inactive === true);
			$('#itemHidden').prop('checked', item.hidden === true);
			$('#itemIsOption').prop('checked', item.isOption === true);
			$('#itemHasOptions').prop('checked', item.hasOptions === true);
			$('#onSale').prop('checked', item.onSale === true);
			$('#catalogIdUS').val(item.catalogId);
			$('#catalogIdCanModal').val(item.catalogIdCan);
			$('#optionId').val(item.optionId);
			$('#optionIdCan').val(item.optionIdCan);
			$('#salePercentage').val(0);
			$('#viewOnUSWebsite').attr('href', item.usLink);
			$('#viewOnCanWebsite').attr('href', item.canLink);
			$('#itemModal').modal();

			if (item.hidden === true) {
				$('#hideUnhide').text('Unhide');
			} else {
				$('#hideUnhide').text('Hide');
			}

			if (putAwayMode) {
				console.log('focusing...');
				$('#warehouse').addClass('show');
				$('#location').select();
			}
		});

		$('#databaseTableBody').append(row);
	});

	$('#databaseTable').DataTable({
		bDestroy: true,
		pageLength: 100,
		order: [[1, 'asc']],
		columnDefs: [{
			targets: 'no-sort',
			orderable: false
		}]
	});
}

function saveItem(item) {
	item = saveItemProperties(item);
	$('#itemModal').modal('hide');
	socket.emit('saveItem', item, false, responses => {
		// refresh the database
		socket.emit('searchDB', lastQuery, items => {
			refreshTable(items);
		});
	});
}

function saveItemProperties(item) {
	item.name = $('#itemName').val();
	item.usPrice = parseFloat($('#usPrice').val());
	item.canPrice = parseFloat($('#canPrice').val());
	item.canSalePrice = parseFloat($('#canSalePrice').val());
	item.usSalePrice = parseFloat($('#usSalePrice').val());
	item.stock = $('#stock').val();
	item.usStock = $('#usStock').val();
	item.canStock = $('#canStock').val();
	item.location = $('#location').val();
	item.secondLocation = $('#secondLocation').val();
	item.barcode = $('#barcode').val();
	item.countryOfOrigin = $('#country').val();
	item.isOption = $('#itemIsOption').is(':checked');
	item.hasOptions = $('#itemHasOptions').is(':checked');
	item.inactive = $('#itemInactive').is(':checked');
	item.hidden = $('#itemHidden').is(':checked');
	item.onSale = $('#onSale').is(':checked');
	return item;
}

function hideUnhide(item) {
	var isHidden = item.hidden;
	item = saveItemProperties(item);

	if (isHidden == true) {
		item.hidden = false;
		item.inactive = false;
	} else {
		item.hidden = true;
		item.inactive = true;
	}
	socket.emit('saveItem', item);
	$('#itemModal').modal('hide');
}