var socket = io();

var itemsInOrder = [];
var usOrder = true;
var customerProfile = 'retail';
var theItem = {};
var theOrder = {};
var theCustomer = {};
var theEditItem = {};

$(document).ready(function() {
	$('#itemSKU').on('input propertychange', function() {
		socket.emit('searchSKU', $('#itemSKU').val());
	});

	$('#itemSKU').on('keydown', function(e) {
		var code = e.keyCode || e.which;
		if (code === 9) {
			var sku = $('#itemSKU').val().toUpperCase().trim();
			socket.emit('searchDB', {sku: sku});
		}
	});

	$('#profileSelect').change(function(e) {
		customerProfile = $('#profileSelect').val();
	});

	$('#websiteSelect').change(function(e) {
		var site = $('#websiteSelect').val();
		if (site === 'canada') {
			usOrder = false;
		} else {
			usOrder = true;
		}
	});

	$('#itemQuantity').change(function(e) {
		calculateLineTotal();
	});

	$('#itemPrice').change(function(e) {
		calculateLineTotal();
	});

	$('#addItemButton').click(function(e) {
		theItem.quantity = $('#itemQuantity').val();
		theItem.salesPrice = $('#itemPrice').val();
		itemsInOrder.push(theItem);
		addItemRow(theItem);
		theItem = {};
		$('#addItemButton').prop('disabled', 'disabled');
		emptyItemLine();
		$('#itemSKU').focus();
		calculateTotals();
	});

	$('#saveToSiteButton').click(function(e) {
		socket.emit('sendTo3DCart', {}, true);
	});

	$('#sameAsShippingButton').click(function(e) {
		copyBillingToShipping();
	});

	$('#saveCustomerButton').click(function(e) {
		saveCustomer();
	});

	$('#saveItemButton').click(function(e) {
		saveItem();
		calculateTotals();
	});

	$('#taxOptions').change(function(e) {
		calculateTotals();
	});
});

socket.on('searchSKUFinished', function(items) {
	$('#itemList').empty();
	items.forEach(function(item) {
		$('#itemList').append('<option>'+item.sku+'</option>');
	});
	$('#addItemButton').prop('disabled', '');
});

socket.on('searchFinished', function(items) {
	// just want the first item
	var item = items[0];
	fillItemLine(item);
	calculateLineTotal();
	theItem = item;
});

function fillItemLine(item) {
	$('#itemName').val(item.name);

	var price = 0;
	if (usOrder) {
		price = item.usPrice;
	}
	else {
		price = item.canPrice;
	}

	if (customerProfile === 'wholesale') {
		price = price / 2;
	}
	$('#itemPrice').val(price.toFixed(2));
}

function calculateLineTotal() {
	var quantity = $('#itemQuantity').val();
	var price = $('#itemPrice').val();
	var linePrice = quantity * price;
	$('#lineTotal').val(linePrice.toFixed(2));
}

function addItemRow(item) {
	var row = $('<tr></tr>');
	var sku = $('<td></td>').text(item.sku);
	var name = $('<td></td>').text(item.name);
	var quantity = $('<td></td>').text(item.quantity);
	var price = $('<td></td>').text('$'+item.salesPrice);
	var lineTotal = item.quantity * item.salesPrice;
	var linePrice = $('<td></td>').text('$'+lineTotal.toFixed(2));

	row.append(sku);
	row.append(name);
	row.append(quantity);
	row.append(price);
	row.append(linePrice);

	row.click(function(e) {
		setItemModalFields(item);
		$('#itemModal').modal();
	});

	$('#orderTableBody').append(row);
}

function emptyItemLine() {
	$('#itemSKU').val('');
	$('#itemName').val('');
	$('#itemPrice').val('');
	$('#itemQuantity').val('1');
	$('#lineTotal').val('');
}

function copyBillingToShipping() {
	$('#shippingAddress').val($('#billingAddress').val());
	$('#shippingAddress2').val($('#billingAddress2').val());
	$('#shippingCity').val($('#billingCity').val());
	$('#shippingState').val($('#billingState').val());
	$('#shippingCountry').val($('#billingCountry').val());
	$('#shippingZip').val($('#billingZip').val());
}

function saveCustomer() {
	$('#customerModal').modal('hide');

	// save the customer to the database
	theCustomer.firstname = $('#customerFirstName').val();
	theCustomer.lastname = $('#customerLastName').val();
	theCustomer.email = $('#customerEmailModal').val();
	theCustomer.phone = $('#customerPhone').val();
	theCustomer.billingAddress = $('#billingAddress').val();
	theCustomer.billingAddress2 = $('#billingAddress2').val();
	theCustomer.billingCity = $('#billingCity').val();
	theCustomer.billingState = $('#billingState').val();
	theCustomer.billingCountry = $('#billingCountry').val();
	theCustomer.billingZipCode = $('#billingZip').val();
	theCustomer.shippingAddress = $('#shippingAddress').val();
	theCustomer.shippingAddress2 = $('#shippingAddress2').val();
	theCustomer.shippingCity = $('#shippingCity').val();
	theCustomer.shippingState = $('#shippingState').val();
	theCustomer.shippingCountry = $('#shippingCountry').val();
	theCustomer.shippingZipCode = $('#shippingZip').val();

	socket.emit('saveCustomer', theCustomer);

	// add the row to the table
	$('#customerTableBody').empty();
	var row = $('<tr></tr>');
	var name = $('<td></td>').text(theCustomer.firstname + ' ' + theCustomer.lastname);
	var email = $('<td></td>').text(theCustomer.email);
	var phone = $('<td></td>').text(theCustomer.phone);
	var address = $('<td></td>').text(theCustomer.shippingAddress);
	var city = $('<td></td>').text(theCustomer.shippingCity);

	row.append(name);
	row.append(email);
	row.append(phone);
	row.append(address);
	row.append(city);

	row.click(function(e) {
		setCustomerModalFields();
		$('#customerModal').modal();
	});

	$('#customerTableBody').append(row);
}

function setCustomerModalFields() {
	$('#customerName').val(theCustomer.firstname + theCustomer.lastname);
	$('#customerFirstName').val(theCustomer.firstname);
	$('#customerLastName').val(theCustomer.lastname);
	$('#customerEmailModal').val(theCustomer.email);
	$('#customerPhone').val(theCustomer.phone);
	$('#billingAddress').val(theCustomer.billingAddress);
	$('#billingAddress2').val(theCustomer.billingAddress2);
	$('#billingCity').val(theCustomer.billingCity);
	$('#billingState').val(theCustomer.billingState);
	$('#billingCountry').val(theCustomer.billingCountry);
	$('#billingZip').val(theCustomer.billingZipCode);
	$('#shippingAddress').val(theCustomer.shippingAddress);
	$('#shippingAddress2').val(theCustomer.shippingAddress2);
	$('#shippingCity').val(theCustomer.shippingCity);
	$('#shippingState').val(theCustomer.shippingState);
	$('#shippingCountry').val(theCustomer.shippingCountry);
	$('#shippingZip').val(theCustomer.shippingZipCode);
}

function setItemModalFields(item) {
	theEditItem = item;
	$('#itemNameTitle').text(item.name);
	$('#itemSKUModal').val(item.sku);
	$('#itemNameModal').val(item.name);
	$('#itemQuantityModal').val(item.quantity);
	$('#itemPriceModal').val(item.salesPrice);

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

	$('#itemImage').attr('src', 'https://ecstasycrafts.com/'+item.imageURL);
	$('#stock').val(item.stock);
	$('#usStock').val(item.usStock);
	$('#canStock').val(item.canStock);
	$('#location').val(item.location);
	$('#barcode').val(item.barcode);
	$('#country').val(item.countryOfOrigin);
	$('#onSale').prop('checked', item.onSale === true);
	$('#viewOnUSWebsite').attr('href', item.usLink);
	$('#viewOnCanWebsite').attr('href', item.canLink);
}

function saveItem() {
	theEditItem.quantity = $('#itemQuantityModal').val();
	theEditItem.salesPrice = $('#itemPriceModal').val();
	buildOrderTable();
	$('#itemModal').modal('hide');
}

function buildOrderTable() {
	$('#orderTableBody').empty();
	itemsInOrder.forEach(function(item) {
		addItemRow(item);
	});
}

function calculateTotals() {
	var subTotal = 0;
	var total = 0;
	var tax = 0;
	var taxPrice = 0;
	var shipping = 0;

	itemsInOrder.forEach(function(item) {
		var itemTotal = item.quantity * item.salesPrice;
		subTotal += itemTotal;
	});

	tax = $('#taxOptions').val() / 100;
	taxPrice = tax * subTotal;

	total = subTotal + taxPrice + shipping;

	$('#subtotal').val(subTotal.toFixed(2));
	$('#taxes').val(taxPrice.toFixed(2));
	$('#total').val(total.toFixed(2));
}