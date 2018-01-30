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
		addItem();
	});

	$('#subtotalButton').click(function() {
		if (validateOrder())
			socket.emit('calculateSubtotal', showItems);
	});

	$('#dismissAlertButton').click(function() {
		$('#orderAlert').hide();
	});

	$('#saveCustomerButton').click(function() {
		saveCustomer();
	});

	$('#saveOrderButton').click(function() {
		if (validateCustomer() && validateOrder()) {
			console.log('saving order');
			saveOrder();
		}
	});

	$('#sameAsShippingButton').click(function(e) {
		copyBillingToShipping();
	});

	$('#itemSKU').on('keydown', (e) => {
		if (e.which == 13) {
			addItem();
		}
	});

	$('#itemQuantity').on('keydown', (e) => {
		if (e.which == 13) {
			addItem();
		}
	});

	$('#fileInput').on('change', e => {
		console.log('file change');
		$('#fileName').text(e.target.files[0].name);

		$('#fileInput').parse({
			config: {
				complete: function(results, file) {
					loadFromTemplate(results.data);
				},
				header: true
			},
			complete: function() {
				console.log('all files done');
			}
		});
	});

	$('#searchCustomerButton').click(e => {
		var customerEmail = $('#customerEmailModal').val();
		socket.emit('searchCustomer3DCart', customerEmail, $('#websiteSelect').val() == 'canada');
	});
});

socket.on('searchCustomer3DCartFinished', (err, customer) => {
	if (err) {
		console.log(err);
		$('#emailSearchInfo').text('An error has occurred');
	} else {
		if (customer.length > 0) {
			$('#emailSearchInfo').text(customer.length + ' customer(s) were found.');
			populateCustomerInfo(customer[0]);
		} else {
			$('#emailSearchInfo').text('No customers were found.');
		}
	}
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

socket.on('saveShowOrderFinished', (err, showOrder) => {
	console.log(showOrder);
	doneLoading();
	if (showOrder) {
		if (showOrder.orderId) {
			order.orderId = showOrder.orderId;
			$('#alert-message').text('The order was successfully saved to 3D Cart. Order ID: ' + showOrder.orderId);
			$('#orderAlert').show();
		}	else {
			console.log(showOrder);
			$('#alert-message').text('There was an error saving the order to 3D Cart');
			$('#orderAlert').show();
		}
		order._id = showOrder._id;
	} else if (err) {
		console.log(err);
		$('#alert-message').text('There was an error saving the order to 3D Cart');
		$('#orderAlert').show();
	}
});

function populateCustomerInfo(customer) {
	console.log(customer);
	$('#customerName').val(customer.BillingFirstName + customer.BillingLastName);
	$('#companyName').val(customer.ShippingCompany);
	$('#customerFirstName').val(customer.BillingFirstName);
	$('#customerLastName').val(customer.BillingLastName);
	$('#customerPhone').val(customer.BillingPhoneNumber);
	$('#billingAddress').val(customer.BillingAddress1);
	$('#billingAddress2').val(customer.BillingAddress2);
	$('#billingCity').val(customer.BillingCity);
	$('#billingState').val(customer.BillingState);
	$('#billingCountry').val(customer.BillingCountry);
	$('#billingZip').val(customer.BillingZipCode);
	$('#shippingAddress').val(customer.ShippingAddress1);
	$('#shippingAddress2').val(customer.ShippingAddress2);
	$('#shippingCity').val(customer.ShippingCity);
	$('#shippingState').val(customer.ShippingState);
	$('#shippingCountry').val(customer.ShippingCountry);
	$('#shippingZip').val(customer.ShippingZipCode);

	$('#profileSelect').val(customer.CustomerGroupID);
}

function addItem() {
	var sku = $('#itemSKU').val();
	var quantity = $('#itemQuantity').val();
	addItemToOrder(sku, quantity);
	$('#itemSKU').val('');
	$('#itemSKU').select();
}

function loadFromTemplate(items) {
	items.forEach((item) => {
		addItemToOrder(item.sku, item.quantity);
	});
}

function loadOrder(dbOrder) {
	console.log(dbOrder);
	if (dbOrder) {
		if (dbOrder.showItems != null) {
			order = dbOrder;
			customer = dbOrder.customer;
			showItems = order.showItems;

			if (dbOrder.notes != undefined) {
				$('#notesArea').val(dbOrder.notes);
			}

			if (dbOrder.coupon != undefined) {
				$('#couponCode').val(dbOrder.coupon);
			}

			addCustomerRow(customer);
			showItems.forEach((item) => {addItemRow(item)});
		}
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

	skuInput.select();
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
	
	if (!validCustomer) {
		$('#alert-message').text('Customer information is not completed.');
		$('#orderAlert').show();
	}

	return validCustomer;
}

function saveCustomer() {
	$('#customerModal').modal('hide');

	// save the customer to the database
	customer.companyName = $('#companyName').val();
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
	customer.profile = $('#profileSelect').val();
	customer.website = $('#websiteSelect').val();

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
	$('#profileSelect').val(customer.profile);
	$('#websiteSelect').val(customer.website);
}

function saveOrder() {
	order.showItems = showItems;
	order.notes = $('#notesArea').val();
	order.customer = customer;
	order.coupon = $('#couponCode').val();
	socket.emit('saveShowOrder', order);
	showLoading();
}

function showLoading() {
	$('#saveOrderButton').button('loading');
}

function doneLoading() {
	$('#saveOrderButton').button('reset');
}

function validateOrder() {
	var duplicate = false;
	for(var i = 0; i < showItems.length; i++) {
		var item = showItems[i];
		for (var j = 0; j < showItems.length; j++) {
			var tempItem = showItems[j];
			if (item.sku == tempItem.sku && i != j) {
				duplicate = true;
			}
		}
	}
	if (duplicate) {
		$('#alert-message').text('There are duplicate items in the order. Please make sure all items are unique');
		$('#orderAlert').show();
	}
	return !duplicate;
}