var socket = io();

var itemsInOrder = [];
var usOrder = false;
var customerProfile = 'retail';
var theItem = {};
var theOrder = {};
var theCustomer = {};
var theEditItem = {};
var salesTax = 0;
var subTotal = 0;
var shipping = 0;
var total = 0;
var paymentMethod = 'On Account';
var updatingOrder = false;

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
		socket.emit('saveOrder', generateOrder(), !usOrder);
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

	$('#customerSearch').on('input propertychange', function() {
		socket.emit('searchCustomer', $('#customerSearch').val());
	});

	$('#loadFrom3DCartButton').click(function() {
		socket.emit('loadFrom3DCart', $('#prefixSelect').val(), $('#orderNumber').val());
	});
});

socket.on('receivedOrder', function(orders) {
	theOrder = orders[0];
	theCustomer = {
		billingAddress: theOrder.BillingAddress,
		billingAddress2: theOrder.BillingAddress2,
		billingCity: theOrder.BillingCity,
		companyName: theOrder.BillingCompany,
		email: theOrder.BillingEmail,
		firstname: theOrder.BillingFirstName,
		lastname: theOrder.BillingLastName,
		billingState: theOrder.BillingState,
		billingZipCode: theOrder.BillingZipCode,
		shippingAddress: theOrder.ShipmentList[0].ShipmentAddress,
		shippingAddress2: theOrder.ShipmentList[0].ShipmentAddress2,
		shippingCity: theOrder.ShipmentList[0].ShipmentCity,
		companyName: theOrder.ShipmentList[0].ShipmentCompany,
		shippingState: theOrder.ShipmentList[0].ShipmentState,
		shippingZipCode: theOrder.ShipmentList[0].ShipmentZipCode,
		phone: theOrder.BillingPhoneNumber
	};

	usOrder = theOrder.InvoicePrefix == "AB-";

	itemsInOrder = [];
	theOrder.OrderItemList.forEach(function(item) {
		var orderItem = {
			name: item.ItemDescription,
			sku: item.ItemID,
			quantity: item.ItemQuantity,
			imageURL: item.ItemImage1,
			salesPrice: item.ItemUnitPrice
		}
		itemsInOrder.push(orderItem);
	});

	addCustomerRow(theCustomer);
	buildOrderTable();
	calculateTotals();
});

socket.on('searchCustomerFinished', function(customers) {
	$('#emailList').empty();
	customers.forEach(function(customer) {
		$('#emailList').append('<option>'+customer.email+'</option>');
	});

	if (customers.length == 1) {
		// load the customer fields in
		setCustomerModalFields(customers[0]);
	}
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
	addCustomerRow(theCustomer);
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
	var tax = 0;
	subTotal = 0;
	total = 0;


	itemsInOrder.forEach(function(item) {
		var itemTotal = item.quantity * item.salesPrice;
		subTotal += itemTotal;
	});

	tax = $('#taxOptions').val() / 100;
	salesTax = tax * subTotal;

	total = subTotal + salesTax + shipping;

	$('#subtotal').val(subTotal.toFixed(2));
	$('#taxes').val(salesTax.toFixed(2));
	$('#total').val(total.toFixed(2));
}

function generateOrder() {
	var order = {
		BillingFirstName: theCustomer.firstname,
		BillingLastName: theCustomer.lastname,
		BillingAddress: theCustomer.billingAddress,
		BillingAddress2: theCustomer.billingAddress2,
		BillingCompany: theCustomer.companyName,
		BillingCity: theCustomer.billingCity,
		BillingCountry: theCustomer.billingCountry,
		BillingZipCode: theCustomer.billingZipCode,
		BillingPhoneNumber: theCustomer.phone,
		BillingEmail: theCustomer.email,
		BillingPaymentMethod: paymentMethod,
		BillingPaymentMethodID: '49', // need to look up all of these
		ShipmentList: [{
			ShipmentOrderStatus: 1, // NEW
			ShipmentFirstName: theCustomer.firstname,
      ShipmentLastName: theCustomer.lastname,
      ShipmentAddress: theCustomer.shippingAddress,
      ShipmentCity: theCustomer.shippingCity,
      ShipmentState: theCustomer.shippingState,
      ShipmentCountry: theCustomer.shippingCountry,
      ShipmentZipCode: theCustomer.shippingZipCode,
      ShipmentPhone: theCustomer.phone
		}],
		OrderItemList: [],
		SalesTax: salesTax,
		OrderStatusID: 1 // NEW
	};

	itemsInOrder.forEach(function(item) {
		var orderItem = {
			ItemID: item.sku,
			ItemQuantity: item.quantity,
			ItemUnitPrice: item.salesPrice,
			ItemDescription: item.name
		}
		order.OrderItemList.push(orderItem);
	});

	return order;
}