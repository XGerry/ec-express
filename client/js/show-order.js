var socket = io();
var showItems = []; // the list of items
var customer = {};
var order = {};

$(document).ready(function() {
	$('#orderAlert').hide();

	$('#decreaseQuantity').click(function() {
		var quantity = $('#itemQuantity').val();
		quantity--;
		if (quantity < 1) {
			quantity = 1;
		}
		$('#itemQuantity').val(quantity);
	});

	$('#increaseQuantity').click(function() {
		var quantity = $('#itemQuantity').val();
		quantity++;
		$('#itemQuantity').val(quantity);
	});

	$('#addItemButton').click(function() {
		var sku = $('#itemSKU').val();
		var quantity = $('#itemQuantity').val();
		addItemToOrder(sku, quantity);
	});

	$('#subtotalButton').click(function() {
		console.log(showItems);
		socket.emit('calculateSubtotal', showItems);
	});

	$('#dismissAlertButton').click(function() {
		$('#orderAlert').hide();
	});

	$('#saveCustomerButton').click(function() {
		saveCustomer();
	});

	$('#saveOrderButton').click(function() {
		if (validateCustomer()) {
			console.log('saving order');
			saveOrder();
		} else {
			console.log('invalid order');
			$('#alert-message').text('Customer information is not completed.');
			$('#orderAlert').show();
		}
	});

	$('#sameAsShippingButton').click(function(e) {
		copyBillingToShipping();
	});
});

socket.on('calculateSubtotalFinished', function(response) {
	$('#subtotal').text('$' + response.total);
	console.log(response);
	if (response.message != '') {
		console.log('alert');
		$('#alert-message').text(response.message);
		$('#orderAlert').show();
	}
});

socket.on('saveShowOrderFinished', (response) => {
	if (response[0].Status == '201') {
		order.orderId = response[0].Value;
		$('#alert-message').text('The order was successfully saved to 3D Cart. Order ID: ' + response[0].Value);
		$('#orderAlert').show();
	} else if (response[0].Status == '200') {
		$('#alert-message').text('The order was successfully updated');
		$('#orderAlert').show();
	}
	else {
		console.log(response);
		$('#alert-message').text('There was an error saving the order to 3D Cart');
		$('#orderAlert').show();
	}
});

function loadOrder(dbOrder) {
	console.log(dbOrder);
	if (dbOrder.showItems != null) {
		order = dbOrder;
		customer = dbOrder.customer;
		showItems = order.showItems;

		addCustomerRow(customer);
		showItems.forEach((item) => {addItemRow(item)});
	}
}

function addItemRow(item) {
	var sku = item.sku;
	var quantity = item.quantity;

	var row = $('<div class="row form-group"></div>');

	var skuInput = $('<input class="form-control input-lg" type="text">');
	skuInput.val(sku);

	var quantityInput = $('<input class="form-control" type="number">');
	quantityInput.val(quantity);

	var skuCol = $('<div class="col-lg-3 col-sm-3"></div>');
	skuCol.append(skuInput);

	var quantityCol = $('<div class="col-lg-3 col-sm-3"></div>');
	var inputGroup = $('<div class="input-group input-group-lg"></div>');

	var inputGroupButtonMinus = $('<span class="input-group-btn"></span>');
	var buttonMinus = $('<button class="btn btn-default"><i class="fa fa-minus"></button>');
	inputGroupButtonMinus.append(buttonMinus);

	var inputGroupButtonPlus = $('<span class="input-group-btn"></span>');
	var buttonPlus = $('<button class="btn btn-default"><i class="fa fa-plus"></button>');
	inputGroupButtonPlus.append(buttonPlus);

	inputGroup.append(inputGroupButtonMinus);
	inputGroup.append(quantityInput);
	inputGroup.append(inputGroupButtonPlus);
	
	var buttonToolbar = $('<div class="btn-toolbar"></div>');
	var duplicateButton = $('<button class="btn btn-info btn-lg" type="button">Duplicate</button>')
	var removeButton = $('<button class="btn btn-danger btn-lg" type="button">&times;</button>')

	buttonToolbar.append(duplicateButton);
	buttonToolbar.append(removeButton);

	var buttonCol = $('<div class="col-lg-4 col-sm-4"></div>');
	buttonCol.append(buttonToolbar);

	quantityCol.append(inputGroup);

	row.append(skuCol);
	row.append(quantityCol);
	row.append(buttonCol);

	$('#orderSheet').prepend(row);	

	// button events
	removeButton.click(function(e) {
		showItems.splice(showItems.indexOf(item), 1);
		row.remove();
	});

	duplicateButton.click(function(e) {
		addItemToOrder(skuInput.val(), quantityInput.val());
	});

	buttonMinus.click(function() {
		var rowQ = quantityInput.val();
		rowQ--;
		if (rowQ < 1) {
			rowQ = 1;
		}
		quantityInput.val(rowQ);
		item.quantity = rowQ;
	});

	buttonPlus.click(function() {
		var rowQ = quantityInput.val();
		rowQ++;
		item.quantity = rowQ;
		quantityInput.val(rowQ);
	});

	skuInput.change(function() {
		var newSku = skuInput.val();
		item.sku = newSku;
	});

	$('#itemSKU').select();
}

function addItemToOrder(sku, quantity) {
	sku = sku.toUpperCase();
	
	var item = {
		sku: sku,
		quantity: quantity,
		message: '',
		total: 0
	};

	showItems.push(item);
	addItemRow(item);
}

function copyBillingToShipping() {
	$('#shippingAddress').val($('#billingAddress').val());
	$('#shippingAddress2').val($('#billingAddress2').val());
	$('#shippingCity').val($('#billingCity').val());
	$('#shippingState').val($('#billingState').val());
	$('#shippingCountry').val($('#billingCountry').val());
	$('#shippingZip').val($('#billingZip').val());
}

function validateCustomer() {
	var validCustomer = customer.email != null &&
		customer.firstname != null &&
		customer.lastname != null &&
		customer.billingAddress != null &&
		customer.billingCity != null &&
		customer.billingCountry != null &&
		customer.billingState != null &&
		customer.billingZipCode != null &&
		customer.shippingAddress != null &&
		customer.shippingCity != null &&
		customer.shippingCountry != null &&
		customer.shippingState != null &&
		customer.shippingZipCode != null;
	return validCustomer;
}

function saveCustomer() {
	$('#customerModal').modal('hide');

	// save the customer to the database
	customer.firstname = $('#customerFirstName').val();
	customer.lastname = $('#customerLastName').val();
	customer.email = $('#customerEmailModal').val();
	customer.phone = $('#customerPhone').val();
	customer.billingAddress = $('#billingAddress').val();
	customer.billingAddress2 = $('#billingAddress2').val();
	customer.billingCity = $('#billingCity').val();
	customer.billingState = $('#billingState').val();
	customer.billingCountry = $('#billingCountry').val();
	customer.billingZipCode = $('#billingZip').val();
	customer.shippingAddress = $('#shippingAddress').val();
	customer.shippingAddress2 = $('#shippingAddress2').val();
	customer.shippingCity = $('#shippingCity').val();
	customer.shippingState = $('#shippingState').val();
	customer.shippingCountry = $('#shippingCountry').val();
	customer.shippingZipCode = $('#shippingZip').val();

	addCustomerRow(customer);
}

function addCustomerRow(customer) {
	// add the row to the table
	$('#customerTableBody').empty();
	var row = $('<tr></tr>');
	var name = $('<td></td>').text(customer.firstname + ' ' + customer.lastname);
	var email = $('<td></td>').text(customer.email);
	var phone = $('<td></td>').text(customer.phone);
	var address = $('<td></td>').text(customer.shippingAddress);
	var city = $('<td></td>').text(customer.shippingCity);

	row.append(name);
	row.append(email);
	row.append(phone);
	row.append(address);
	row.append(city);

	row.click(function(e) {
		setCustomerModalFields(customer);
		$('#customerModal').modal();
	});

	$('#customerTableBody').append(row);
}

function setCustomerModalFields(customer) {
	$('#customerName').val(customer.firstname + customer.lastname);
	$('#customerFirstName').val(customer.firstname);
	$('#customerLastName').val(customer.lastname);
	$('#customerEmailModal').val(customer.email);
	$('#customerPhone').val(customer.phone);
	$('#billingAddress').val(customer.billingAddress);
	$('#billingAddress2').val(customer.billingAddress2);
	$('#billingCity').val(customer.billingCity);
	$('#billingState').val(customer.billingState);
	$('#billingCountry').val(customer.billingCountry);
	$('#billingZip').val(customer.billingZipCode);
	$('#shippingAddress').val(customer.shippingAddress);
	$('#shippingAddress2').val(customer.shippingAddress2);
	$('#shippingCity').val(customer.shippingCity);
	$('#shippingState').val(customer.shippingState);
	$('#shippingCountry').val(customer.shippingCountry);
	$('#shippingZip').val(customer.shippingZipCode);
}

function saveOrder() {
	order.showItems = showItems;
	order.customer = customer;
	socket.emit('saveShowOrder', order);
}