var socket = io();
var order;
var theItem;
var currentIndex = 0;

function buildPickTable(order) {
	this.order = order;
	sortItems();
	var totalItems = 0;
	order.OrderItemList.forEach((item, index) => {
		var row = $('<tr></tr>');
		var locationCol = $('<td></td>');
		locationCol.text(item.ItemWarehouseLocation); 
		var skuCol = $('<td></td>');
		skuCol.text(item.ItemID); 
		var descriptionCol = $('<td></td>');
		descriptionCol.html(item.ItemDescription);
		var descriptionText = descriptionCol.text();
		var orderQuantityCol = $('<td></td>');
		orderQuantityCol.text(item.ItemQuantity);
		var quantityPickedCol = $('<td></td>');
		if (item.quantityPicked) {
			quantityPickedCol.text(item.quantityPicked);
		} else {
			quantityPickedCol.text('0');
		}
		totalItems += parseInt(item.ItemQuantity);
		var stockCol = $('<td></td>');
		stockCol.text(item.ItemUnitStock);

		var pickedCol = $('<td></td>');
		var pickedBox = $('<input type="checkbox" style="width:25px;height:25px;margin:0;">');

		pickedBox.prop('checked', item.picked);
		pickedCol.append(pickedBox);

		row.append(locationCol);
		row.append(skuCol);
		row.append(orderQuantityCol);
		row.append(quantityPickedCol);
		row.append(pickedCol);
		row.append(descriptionCol);
		row.append(stockCol);

		$('#pickTableBody'+order.InvoiceNumberPrefix+order.InvoiceNumber).append(row);

		row.click(e => {
			currentIndex = index;
			theItem = item;
			pickNextItem();
			$('#summary').hide();
			$('#pickarea').show();
		});
	});

	$('#orderNavTitle').text(order.InvoiceNumberPrefix+order.InvoiceNumber);

	$('#totalItems'+order.InvoiceNumberPrefix+order.InvoiceNumber).text(totalItems);
	var customerType = 'Retail';
	if (order.CustomerGroupID == '2' || order.CustomerGroupID == '14') {
		customerType = 'Wholesale';
	} else if (order.CustomerGroupID == '3') {
		customerType = 'Teacher';
	} else if (order.CustomerGroupID == '4') {
		customerType = 'Preferred Customer';
	}
	$('#customerType'+order.InvoiceNumberPrefix+order.InvoiceNumber).text(customerType);

	var pickTable = $('#pickTable'+order.InvoiceNumberPrefix+order.InvoiceNumber).DataTable({
		bDestroy: true,
		order: [[0, 'asc']],
		paging: false,
		searching: true,
		autoWidth: false,
		columnDefs: [{
			className: 'dt-center',
			targets: [2,3]
		}]
	});
}

$(document).ready(e => {
	$('#startPickingButton').click(e => {
		pickNextItem();
		$('#summary').hide();
		$('#pickarea').show();
	});

	$('#saveToQuickbooks').click(e => {
		console.log(order);
		// TODO: validate the order
		socket.emit('createInvoice', order, response => {
			console.log('response');
		});
	});

	$('#showSummaryButton').click(e => {
		showSummary();
	});

	$('#itemBarcodeInput').on('keyup', e => {
		if (e.keyCode == 13 || e.which == 13) {
			var barcodeEntered = $('#itemBarcodeInput').val();
			if (theItem.ItemBarcode == barcodeEntered) {
				scan('barcodeInputGroup', 'barcodeIcon', true);
				var pickCount = increasePickCount();
				if (theItem.ItemQuantity == pickCount) {
					// we're automatically done
					donePicking(pickCount);
				}
			} else {
				scan('barcodeInputGroup', 'barcodeIcon', false);
			}
			$('#itemBarcodeInput').select();
		}
	});

	$('#nextItemButton').click(e => {
		$('#itemBarcodeInput').val('');
		currentIndex++;
		pickNextItem();
	});

	$('#prevItemButton').click(e => {
		$('#itemBarcodeInput').val('');
		currentIndex--;
		pickNextItem();
	});

	$('#donePickingButton').click(e => {
		$('#itemBarcodeInput').val('');
		var quantityPicked = parseInt($('#itemQuantityPicked').val());
		if (theItem.picked && theItem.quantityPicked == quantityPicked) {
			alert('You have already picked this item!');
		} else {
			donePicking(quantityPicked);
		}
	});

	$('#minusButton').click(e => {
		var currentValue = $('#itemQuantityPicked').val();
		if (currentValue <= 0) {
			return;
		} 
		currentValue--;
		$('#itemQuantityPicked').val(currentValue);
	});	

	$('#plusButton').click(e => {
		increasePickCount();
	});

	$('#fixBarcodeButton').click(e => {
		e.preventDefault();
		if (theItem) {
			$('#newBarcode').val(theItem.ItemBarcode);
			$('#fixBarcodeModal').modal();
			$('#newBarcode').focus().select();
		}
	});

	$('#fixLocationButton').click(e => {
		e.preventDefault();
		if (theItem) {
			$('#newLocation').val(theItem.ItemWarehouseLocation);
			$('#fixLocationModal').modal();
			$('#newLocation').focus().select();
		}
	});

	$('#needsRestockButton').click(e => {
		e.preventDefault();
		if (theItem) {
			theItem.needsRestocking = true;
			socket.emit('saveItem', theItem, false, responses => {
				console.log('Saved the item');
			});
		}
	});

	$('#saveBarcodeModal').click(e => {
		$('#fixBarcodeModal').modal('hide');
		theItem.ItemBarcode = $('#fixBarcode').val();
		socket.emit('saveItem', {
			sku: theItem.ItemID,
			barcode: theItem.ItemBarcode
		}, false, responses => {
			console.log('Saved the barcode');
		});
	});

	$('#saveLocationModal').click(e => {
		$('#fixLocationModal').modal('hide');
		theItem.ItemBarcode = $('#newLocation').val();
		socket.emit('saveItem', {
			sku: theItem.ItemID,
			location: theItem.ItemBarcode
		}, false, responses => {
			console.log('Saved the location');
		});
	});
});

function donePicking(quantityPicked) {
	theItem.picked = true;
	theItem.quantityPicked = quantityPicked;
	currentIndex++;
	pickNextItem();
}

function increasePickCount() {
	var currentValue = $('#itemQuantityPicked').val();
	currentValue++;
	$('#itemQuantityPicked').val(currentValue);
	return currentValue;
}

function showSummary() {
	theItem = null;
	$('#pickTable'+order.InvoiceNumberPrefix+order.InvoiceNumber).dataTable().fnDestroy();
	$('#pickTableBody'+order.InvoiceNumberPrefix+order.InvoiceNumber).empty();
	buildPickTable(order);
	$('#summary').show();
	$('#pickarea').hide();
}

function scan(inputGroupId, iconId, success) {
	if (success) {
		$('#'+inputGroupId).addClass('bg-success');
		$('#'+inputGroupId).removeClass('bg-danger');
		$('#'+iconId).addClass('fa-check');
	} else {
		$('#'+inputGroupId).addClass('bg-danger');
		$('#'+inputGroupId).removeClass('bg-success');
		$('#'+iconId).addClass('fa-times');
	}
}

function populatePickFields(item) {
	$('#itemLocation').text(item.ItemWarehouseLocation);
	$('#itemSkuHeader').text(item.ItemID);
	$('#itemSku').text(item.ItemID);
	$('#itemDescription').html(item.ItemDescription);
	$('#itemQuantity').text(item.ItemQuantity);
	$('#itemSecondLocation').text(item.ItemWarehouseLocationSecondary);
	if (item.ItemBarcode) {
		$('#itemInstructions').text('Scan the item');
		$('#itemBarcodeInput').prop('placeholder', item.ItemBarcode);
		$('#barcodeInput').show();
		$('#itemBarcodeInput').select();
	} else {
		$('#itemInstructions').text('Pick the item');
		$('#barcodeInput').hide();
	}
	$('#itemQuantityOnHand').text(item.ItemUnitStock);

	if (item.picked) {
		$('#donePickingButton').text('Picked');
		$('#itemQuantityPicked').val(item.quantityPicked);
	} else {
		$('#donePickingButton').text('Done');
		$('#itemQuantityPicked').val(0);
	}

	$('#productCarousel').empty();
	if (item.ItemImage1) {
		addProductImage(item.ItemImage1, true);
	}
	if (item.ItemImage2) {
		addProductImage(item.ItemImage2, false);
	}
	if (item.ItemImage3) {
		addProductImage(item.ItemImage3, false);
	}
	if (item.ItemImage4) {
		addProductImage(item.ItemImage4, false);
	}
}

function addProductImage(src, active) {
	if (!src.startsWith('http')) {
		src = 'https://www.ecstasycrafts.com' + src;
	}
	var carouselItem = $('<div class="carousel-item"></div>');
	if (active) {
		carouselItem.addClass('active');
	}
	var productImage = $('<img class="img-fluid">').prop('src', src);
	carouselItem.append(productImage);
	$('#productCarousel').append(carouselItem);
}

function pickNextItem() {
	theItem = getValidItem();
	if (theItem == null) {
		// we're done picking
		showSummary();
	} else {
		populatePickFields(theItem);
 	}
}

function getValidItem() {
	if (currentIndex >= order.OrderItemList.length || currentIndex < 0) {
		currentIndex = 0;
		return null;
	}
	return order.OrderItemList[currentIndex];
}

function sortItems() {
	order.OrderItemList.sort((a, b) => {
		if (a.ItemWarehouseLocation < b.ItemWarehouseLocation) {
			return -1;
		} else if (a.ItemWarehouseLocation > b.ItemWarehouseLocation) {
			return 1;
		} else {
			return 0;
		}
	});
}