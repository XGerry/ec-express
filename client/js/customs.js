var socket = io();
var theOrder = {};
var oldRow = {};
var rowsToSave = [];
var allOrders = [];
var totalValue = 0;
var totalParcels = 0;
var totalWeight = 0;
var theManifest = {};
var addresses = {};

$(document).ready(function() {
	$('#getOrdersButton').click(e => {
		e.preventDefault();
		$('#getOrdersButton').button('loading');
		socket.emit('loadOrdersForManifest', {orderstatus: 13, limit: 200}, 'US');
	});

	$('#doneEditingButton').click(e => {
		// save new HTCs
		rowsToSave.forEach(fn => {
			fn();
		});
		recalculateTotals(theOrder);
		saveShippingInfo(theOrder);
		saveOrderInfo(theOrder);
		if (oldRow)
			oldRow.remove();
		addManifestRow(theOrder);
		$('#orderModal').modal('hide');
	});

	$('#newOrderButton').click(e => {
		var newOrder = {
			ShipmentList: [{
				ShipmentBoxes: 1,
				ShipmentCompany: '',
				ShipmentFirstName: '',
				ShipmentLastName: '',
				BillingEmail: '',
				ShipmentPhone: '',
				ShipmentAddress: '',
				ShipmentAddress2: '',
				ShipmentCity: '',
				ShipmentState: '',
				ShipmentCountry: '',
				ShipmentZipCode: ''
			}],
			htcMap: {}
		};
		recalculateTotals(newOrder);
		theOrder = newOrder;
		oldRow = null;
		populateOrderModal(newOrder);
		allOrders.push(newOrder);
		$('#orderModal').modal();
	});

	$('#addHTCRowButton').click(e => {
		addEditableHTCRow();
	});

	$('#enterTotalsButton').click(e => {
		e.preventDefault();
		$('#totalParcelsInput').val(totalParcels);
		$('#totalWeightInput').val(totalWeight);
		$('#totalValueInput').val(totalValue);
		$('#totalsModal').modal();
	});

	$('#calculateTotals').click(e => {
		e.preventDefault();
		calculateTotalsForManifest();
	});

	$('#doneTotalsButton').click(e => {
		totalParcels = parseInt($('#totalParcelsInput').val());
		totalWeight = parseFloat($('#totalWeightInput').val());
		totalValue = parseFloat($('#totalValueInput').val());

		setTotalFields();
		$('#totalsModal').modal('hide');
	});

	$('#saveButton').click(e => {
		saveManifest();
	});

	$('#deleteManifest').click(e => {
		e.preventDefault();
		socket.emit('deleteManifest', theManifest);
	});

	$('#addressSearch').on('input propertychange', e => {
		socket.emit('searchAddress', $('#addressSearch').val());
	});

	$('#addressSearch').on('keydown', e => {
		if (e.keyCode == 13) {
			applyAddress($('#addressSearch').val());
		}
	});

	$('#applyAddressButton').click(e => {
		applyAddress($('#addressSearch').val());
	});
});

socket.on('searchAddressFinished', results => {
	$('#addressList').empty();
	addresses = {};
	results.forEach(address => {
		$('#addressList').append($('<option>'+address.AddressName+'</option>'));
		addresses[address.AddressName] = address;
	});

	if (results.length == 0) {
		$('#addressInfo').text('No addresses found.');
	} else {
		$('#addressInfo').empty();
	}
});

socket.on('deleteManifestFinished', () => {
	window.location = '/list-manifests';
});

socket.on('saveManifestFinished', (err, newManifest) => {
	if (err) {
		console.log(err);
		return;
	} else {
		theManifest = newManifest;
		setDateFields();
	}
});

socket.on('loadOrdersFinished', response => {
	$('#getOrdersButton').button('reset');
	buildManifest(response);
	saveManifest();
});

function saveManifest() {
	var shipDate = new Date($('#shipDate').val());
	shipDate.setHours(shipDate.getHours() + (shipDate.getTimezoneOffset() / 60));
	theManifest.shipDate = shipDate;
	theManifest.orders = allOrders;
	theManifest.totalWeight = totalWeight;
	theManifest.totalValue = totalValue;
	theManifest.totalParcels = totalParcels;
	socket.emit('saveManifest', theManifest);
}

function applyAddress(addressName) {
	var address = addresses[addressName];
	$('#companyName').val(address.ShipmentCompany);
	$('#customerFirstName').val(address.ShipmentFirstName);
	$('#customerLastName').val(address.ShipmentLastName);

	$('#shippingAddress').val(address.ShipmentAddress);
	$('#shippingAddress2').val(address.ShipmentAddress2);
	$('#shippingCity').val(address.ShipmentCity);
	$('#shippingState').val(address.ShipmentState);
	$('#shippingCountry').val(address.ShipmentCountry);
	$('#shippingZip').val(address.ShipmentZipCode);
}

function loadManifest(manifest) {
	if (manifest) {
		console.log(manifest);
		theManifest = manifest;
		totalValue = theManifest.totalValue;
		totalParcels = theManifest.totalParcels;
		totalWeight = theManifest.totalWeight;
		setTotalFields();
		setDateFields();
		buildManifest(theManifest.orders);
	}
}

function setDateFields() {
	var modifiedDate = new Date(theManifest.lastModified);
	var shipDate = new Date(theManifest.shipDate);
	$('#lastModified').text(modifiedDate.toDateString() + ' ' + modifiedDate.getHours() + ':' + modifiedDate.getMinutes() + ':' + modifiedDate.getSeconds());
	$('#shipDate').val(shipDate.toISOString().split('T')[0]);
}

function setTotalFields() {
	if (totalParcels)
		$('#totalParcels').text(totalParcels);
	if (totalValue)
		$('#totalValue').text(totalValue.toFixed(2));
	if (totalWeight)
		$('#totalWeight').text(totalWeight.toFixed(2));
}

function calculateTotalsForManifest() {
	totalValue = 0;
	totalParcels = 0;
	totalWeight = 0;

	var parcels = 0;

	allOrders.forEach(order => {
		totalValue += order.totalValue;
		parcels = order.ShipmentList[0].ShipmentBoxes;
		if (parcels <= 0)
			parcels = 1; // assume 1 box per shipment, unless otherwise stated
		totalParcels += parcels;
		totalWeight += order.totalWeight;
	});

	setTotalFields();
}

function recalculateTotals(order) {
	var newTotalQuantity = 0;
	var newTotalValue = 0;

	for (htcCode in order.htcMap) {
		var htcObj = order.htcMap[htcCode];
		for (country in htcObj) {
			var cooObj = htcObj[country];
			var quantity = cooObj.quantity;
			var value = cooObj.value;
			newTotalQuantity += quantity;
			newTotalValue += value;
		}
	}

	order.totalItems = newTotalQuantity;
	order.totalValue = newTotalValue;
}

function saveShippingInfo(order) {
	var shipmentInfo = order.ShipmentList[0];
	shipmentInfo.ShipmentCompany = $('#companyName').val();
	shipmentInfo.ShipmentFirstName = $('#customerFirstName').val();
	shipmentInfo.ShipmentLastName = $('#customerLastName').val();
	shipmentInfo.BillingEmail = $('#customerEmailModal').val();
	shipmentInfo.ShipmentPhone = $('#customerPhone').val();
	shipmentInfo.ShipmentAddress = $('#shippingAddress').val();
	shipmentInfo.ShipmentAddress2 = $('#shippingAddress2').val();
	shipmentInfo.ShipmentCity = $('#shippingCity').val();
	shipmentInfo.ShipmentState = $('#shippingState').val();
	shipmentInfo.ShipmentCountry = $('#shippingCountry').val();
	shipmentInfo.ShipmentZipCode = $('#shippingZip').val();

	socket.emit('saveAddress', shipmentInfo);
}

function saveOrderInfo(order) {
	order.InvoiceNumberPrefix = $('#invoicePrefix').val();
	order.InvoiceNumber = $('#invoiceNumber').val();
	order.totalWeight = parseFloat($('#orderWeight').val());
	order.ShipmentList[0].ShipmentBoxes = parseInt($('#orderParcels').val());
}

function buildManifest(orders) {
	allOrders = allOrders.concat(orders);
	//$('#manifest').empty();

	orders.forEach((order) => {
		addManifestRow(order);
	});
}

function addManifestRow(order) {
	var row = $('<div class="row pb-3"></div>');
	var innerCol = $('<div class="col-12"></div>');
	var panel = $('<div class="card"></div>');
	var panelHeading = $('<div class="card-header"></div>');
	var panelBody = $('<div class="card-body"></div>');
	var panelRow = $('<div class="row"></div>');
	var addressCol = $('<div class="col-4"></div>');
	var orderDetailCol = $('<div class="col-8"></div>');

	var invoiceID = '' + order.InvoiceNumberPrefix + order.InvoiceNumber;
	panelHeading.append($('<h5 class="d-inline-block mb-0">'+invoiceID+'</h5>'));
	var buttonGroup = $('<div class="btn-group float-right hide-printer"></div>');
	var editButton = $('<button class="btn btn-sm btn-outline-primary" type="button">Edit</button>');
	var removeButton = $('<button class="btn btn-sm btn-danger" type="button">Remove</button>');
	buttonGroup.append(editButton);
	buttonGroup.append(removeButton);
	panelHeading.append(buttonGroup);

	// Address Info
	var shipmentInfo = order.ShipmentList[0];
	var addressInfo = $('<address></address>');
	var html = '';
	if (shipmentInfo.ShipmentCompany != '') {
		html += '<strong>' + shipmentInfo.ShipmentCompany + '</strong><br>'; 
	}
	html += '<strong>' + shipmentInfo.ShipmentFirstName + ' ' + shipmentInfo.ShipmentLastName + '</strong><br>';
	html += shipmentInfo.ShipmentAddress + '<br>';
	if (shipmentInfo.ShipmentAddress2 != '') {
		html += shipmentInfo.ShipmentAddress2 + '<br>';
	}
	html += shipmentInfo.ShipmentCity + '<br>';
	html += shipmentInfo.ShipmentState + '<br>';
	html += shipmentInfo.ShipmentZipCode + '<br>';
	html += shipmentInfo.ShipmentCountry + '<br>';

	addressInfo.html(html);
	addressCol.append(addressInfo);

	// Item Info
	var orderDetailTable = $('<table class="table table-striped table-sm"></table>');
	var tableHeader = $('<thead></thead>');
	var tableHeaderRow = $('<tr></tr>');
	tableHeaderRow.append('<th>HTC Code</th>');
	tableHeaderRow.append('<th>Country of Origin</th>');
	tableHeaderRow.append('<th>Quantity</th>');
	tableHeaderRow.append('<th>Value</th>');
	tableHeader.append(tableHeaderRow);

	var tableBody = $('<tbody></tbody>');
	for (htcCode in order.htcMap) {
		var htcObj = order.htcMap[htcCode];
		for (country in htcObj) {
			var cooObj = htcObj[country];
			var detailRow = generateOrderDetailRow(htcCode, country, cooObj.quantity, cooObj.value);
			tableBody.append(detailRow);
		}
	}

	var tableFooter = $('<tfoot></tfoot>');
	var tableFooterRow = $('<tr></tr>');
	tableFooterRow.append($('<th></th>'));
	tableFooterRow.append($('<th>Total</th>'));
	tableFooterRow.append($('<th>' + order.totalItems + '</th>'));
	tableFooterRow.append($('<th>$' + order.totalValue.toFixed(2) + '</th>'));
	tableFooter.append(tableFooterRow);

	orderDetailTable.append(tableHeader);
	orderDetailTable.append(tableBody);
	orderDetailTable.append(tableFooter);

	orderDetailCol.append(orderDetailTable);

	panelRow.append(addressCol);
	panelRow.append(orderDetailCol);

	panelBody.append(panelRow);
	panel.append(panelHeading);
	panel.append(panelBody);

	innerCol.append(panel);
	row.append(innerCol);

	if (order.totalValue > 800) {
		panelHeading.addClass('bg-danger text-white');
	}

	$('#manifest').prepend(row);

	// Button Events
	editButton.click(e => {
		oldRow = row;
		populateOrderModal(order);
		$('#orderModal').modal();
	});

	removeButton.click(e => {
		var i = allOrders.indexOf(order);
		allOrders.splice(i, 1);
		row.remove();
	});
}

function generateOrderDetailRow(htc, country, quantity, value) {
	var tableRow = $('<tr></tr>');
	var htcCol = $('<td></td>');
	htcCol.text(htc);
	var cooCol = $('<td></td>');
	cooCol.text(country);
	var quantityCol = $('<td></td>');
	quantityCol.text(quantity);
	var valueCol = $('<td></td>');
	valueCol.text('$' + value.toFixed(2));

	tableRow.append(htcCol);
	tableRow.append(cooCol);
	tableRow.append(quantityCol);
	tableRow.append(valueCol);

	return tableRow;
}

function populateOrderModal(order) {
	theOrder = order;

	$('#invoicePrefix').val(order.InvoiceNumberPrefix);
	$('#invoiceNumber').val(order.InvoiceNumber);

	$('#orderWeight').val(order.totalWeight);

	var shipmentInfo = order.ShipmentList[0];
	$('#orderParcels').val(shipmentInfo.ShipmentBoxes);
	$('#companyName').val(shipmentInfo.ShipmentCompany);
	$('#customerFirstName').val(shipmentInfo.ShipmentFirstName);
	$('#customerLastName').val(shipmentInfo.ShipmentLastName);
	$('#customerEmailModal').val(order.BillingEmail);
	$('#customerPhone').val(shipmentInfo.ShipmentPhone);

	$('#shippingAddress').val(shipmentInfo.ShipmentAddress);
	$('#shippingAddress2').val(shipmentInfo.ShipmentAddress2);
	$('#shippingCity').val(shipmentInfo.ShipmentCity);
	$('#shippingState').val(shipmentInfo.ShipmentState);
	$('#shippingCountry').val(shipmentInfo.ShipmentCountry);
	$('#shippingZip').val(shipmentInfo.ShipmentZipCode);

	$('#itemDetailModal').empty();
	rowsToSave =[];
	populateHTCTable(order);
}

function populateHTCTable(order) {
	for (htcCode in order.htcMap) {
		var htcObj = order.htcMap[htcCode];
		for (country in htcObj) {
			var cooObj = htcObj[country];
			var quantity = cooObj.quantity;
			var value = cooObj.value;
			var htcRow = buildHTCTableRow(htcCode, country, quantity, value, order.htcMap);
			$('#itemDetailModal').append(htcRow);
		}
	}
}

function addEditableHTCRow() {
	var row = $('<div class="row"></div>');
	var htcCol = $('<div class="col-3 form-group"></div>'); 
	var cooCol = $('<div class="col-4 form-group"></div>'); 
	var quantityCol = $('<div class="col-2 form-group"></div>'); 
	var valueCol = $('<div class="col-3 form-group"></div>'); 

	var htcSelect = $('<select class="form-control"></select>');
	var htcOption1 = $('<option val="9503 00 00 90">9503 00 00 90</option>');
	var htcOption2 = $('<option val="4901 99 00 93">4901 99 00 93</option>');

	htcSelect.append(htcOption1);
	htcSelect.append(htcOption2);

	var cooSelect = $('<select class="form-control"></select>');
	var cooOption1 = $('<option val="CHINA">CHINA</option>');
	var cooOption2 = $('<option val="USA">USA</option>');
	var cooOption3 = $('<option val="CANADA">CANADA</option>');
	var cooOption4 = $('<option val="NETHERLANDS">NETHERLANDS</option>');
	var cooOption5 = $('<option val="ITALY">ITALY</option>');
	var cooOption6 = $('<option val="GERMANY">GERMANY</option>');
	var cooOption7 = $('<option val="UK">UK</option>');
	var cooOption8 = $('<option val="THAILAND">THAILAND</option>');
	var cooOption9 = $('<option val="POLAND">POLAND</option>');
	var cooOption10 = $('<option val="JAPAN">JAPAN</option>');

	cooSelect.append(cooOption1);
	cooSelect.append(cooOption2);
	cooSelect.append(cooOption3);
	cooSelect.append(cooOption4);
	cooSelect.append(cooOption5);
	cooSelect.append(cooOption6);
	cooSelect.append(cooOption7);
	cooSelect.append(cooOption8);
	cooSelect.append(cooOption9);
	cooSelect.append(cooOption10);

	var quantityInput = $('<input type="number" class="form-control">');
	var valueInput = $('<input type="number" class="form-control">');

	htcCol.append(htcSelect);
	cooCol.append(cooSelect);
	quantityCol.append(quantityInput);
	valueCol.append(valueInput);

	row.append(htcCol);
	row.append(cooCol);
	row.append(quantityCol);
	row.append(valueCol);

	$('#itemDetailModal').append(row);

	function saveNewHTCRow() {
		var htc = htcSelect.val();
		var coo = cooSelect.val().toUpperCase();
		var quantity = parseInt(quantityInput.val());
		var value = parseFloat(valueInput.val());
		addHTCtoMap(htc, coo, quantity, value);
	}
	rowsToSave.push(saveNewHTCRow);
}

function addHTCtoMap(htc, coo, quantity, value) {
	var htcMap = theOrder.htcMap;
	if (!htcMap.hasOwnProperty(htc)) {
    htcMap[htc] = {};
  }
  var htcObj = htcMap[htc];
  if (!htcObj.hasOwnProperty(coo)) {
    htcObj[coo] = {
      quantity: 0,
      value: 0
    };
  }
  htcMap[htc][coo].quantity = quantity;
  htcMap[htc][coo].value = value;
}

function buildHTCTableRow(htc, coo, quantity, value, htcMap) {
	var row = $('<div class="row"></div>');
	var htcCol = $('<div class="col-3 form-group"></div>'); 
	var cooCol = $('<div class="col-4 form-group"></div>'); 
	var quantityCol = $('<div class="col-2 form-group"></div>'); 
	var valueCol = $('<div class="col-3 form-group"></div>');

	htcCol.text(htc);
	cooCol.text(country);

	var quantityInput = $('<input type="number" class="form-control">');
	quantityInput.val(quantity);
	var valueInput = $('<input type="number" class="form-control">');
	valueInput.val(value.toFixed(2));

	quantityCol.append(quantityInput);
	valueCol.append(valueInput);

	row.append(htcCol);
	row.append(cooCol);
	row.append(quantityCol);
	row.append(valueCol);

	// events
	quantityInput.on('change', e => {
		var newQuantity = parseInt(quantityInput.val());
		htcMap[htc][coo].quantity = newQuantity;
	});

	valueInput.on('change', e => {
		var newValue = parseFloat(valueInput.val());
		htcMap[htc][coo].value = newValue;
	});

	return row;
}