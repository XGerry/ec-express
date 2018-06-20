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
		totalItems += parseInt(item.ItemQuantity);
		var stockCol = $('<td></td>');
		stockCol.text(item.ItemUnitStock);

		var pickedCol = $('<td></td>');
		var pickedBox = $('<input type="checkbox" style="width:25px;height:25px;margin:0;">');
		console.log(item.picked);
		pickedBox.prop('checked', item.picked);
		pickedCol.append(pickedBox);

		row.append(locationCol);
		row.append(skuCol);
		row.append(orderQuantityCol);
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

	$('#showSummaryButton').click(e => {
		showSummary();
	});

	$('#locationInput').on('keyup', e => {
		if (e.keyCode == 13) {
			var locationEntered = $('#locationInput').val();
			if (theItem.ItemWarehouseLocation == locationEntered) {
				scan('locationInputGroup', 'locationIcon', true);
				$('#itemBarcodeInput').select();
			} else {
				scan('locationInputGroup', 'locationIcon', false);
				$('#locationInput').select();
			}
		}
	});

	$('#itemBarcodeInput').on('keyup', e => {
		if (e.keyCode == 13) {
			var barcodeEntered = $('#itemBarcodeInput').val();
			if (theItem.ItemBarcode == barcodeEntered) {
				scan('barcodeInputGroup', 'barcodeIcon', true);
				$('#donePickingButton').focus();
			} else {
				scan('barcodeInputGroup', 'barcodeIcon', false);
				$('#itemBarcodeInput').select();
			}
		}
	});

	$('#skipItemButton').click(e => {
		$('#locationInput').val('');
		$('#itemBarcodeInput').val('');
		currentIndex++;
		pickNextItem();
	});

	$('#donePickingButton').click(e => {
		$('#locationInput').val('');
		$('#itemBarcodeInput').val('');
		theItem.picked = true;
		currentIndex++;
		pickNextItem();
	});

	$('#minusButton').click(e => {
		var currentValue = $('#itemQuantityPicked').val();
		if (currentValue <= 1) {
			return;
		} 
		currentValue--;
		$('#itemQuantityPicked').val(currentValue);
	});	

	$('#plusButton').click(e => {
		var currentValue = $('#itemQuantityPicked').val();
		currentValue++;
		$('#itemQuantityPicked').val(currentValue);
	});
});

function showSummary() {
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
	$('#locationInput').prop('placeholder', item.ItemWarehouseLocation);
	$('#itemBarcodeInput').prop('placeholder', item.ItemBarcode);
	$('#itemQuantityOnHand').text(item.ItemUnitStock);
	$('#itemQuantityPicked').val(item.ItemQuantity);

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
		$('#locationInput').select();
	}
}

function getValidItem() {
	var donePicking = true;
	for (var i = 0; i < order.OrderItemList.length; i++) {
		if (!order.OrderItemList[i].picked) {
			donePicking = false;
			break;
		}
	}
	if (donePicking) {
		return null;
	}
	if (currentIndex >= order.OrderItemList.length) {
		currentIndex = 0;
	}
	var theItem = order.OrderItemList[currentIndex];
	if (theItem.picked == true) {
		currentIndex++;
		return getValidItem();
	}
	return theItem;
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