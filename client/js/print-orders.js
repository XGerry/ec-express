var socket = io();

$(document).ready(e => {
	socket.emit('loadOrders', {
		orderstatus: 1,
		limit: 200
	});

	$('#printAllButton').click(e => {
		var status = $('#orderStatus').val();
		console.log(status);
		window.open('/picksheet?orderStatus='+status);
	});
});

socket.on('loadOrdersFinished', orders => {
	buildOrderTable(orders);
});

function buildOrderTable(orders) {
	orders.forEach(order => {
		$('#orderTableBody').append(buildTableRow(order));
	});
}

function buildTableRow(order) {
	var row = $('<tr></tr>');
	var invoiceNumberCol = $('<td></td>');
	invoiceNumberCol.text(''+order.InvoiceNumberPrefix + order.InvoiceNumber);
	var customerNameCol = $('<td></td>');
	customerNameCol.text(order.BillingFirstName + ' ' + order.BillingLastName);
	var companyNameCol = $('<td></td>');
	companyNameCol.text(order.BillingCompany);
	var skusCol = $('<td></td>');
	skusCol.text(order.OrderItemList.length);

	var itemNumberCol = $('<td></td>');
	var totalItems = 0;
	order.OrderItemList.forEach(item => {
		totalItems += parseInt(item.ItemQuantity);
	});
	itemNumberCol.text(totalItems);

	var orderValueCol = $('<td></td>');
	orderValueCol.text('$' + order.OrderAmount.toFixed(2));

	row.append(invoiceNumberCol);
	row.append(customerNameCol);
	row.append(companyNameCol);
	row.append(skusCol);
	row.append(itemNumberCol);
	row.append(orderValueCol);

	row.click(e => {
		window.open("/picksheet?orderId="+order.InvoiceNumberPrefix+order.InvoiceNumber);
	});

	return row;
}