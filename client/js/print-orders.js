var socket = io();

$(document).ready(e => {
	$('#printAllButton').click(e => {
		window.open('/picksheet?orderStatus=1');
	});

	$('#orderStatus').on('change', e => {
		$('#printAllButton').button('loading');
		socket.emit('loadOrders', {
			orderstatus: $('#orderStatus').val(),
			limit: 200
		});
	});

	$('#createBatchButton').click(e => {
		var batchType = $('#batchType').val();
		socket.emit('getAutoBatch', batchType, batch => {
			window.location = '/batch-sheet?id='+batch._id;
		});
	});
});

function buildOrderTable(orders) {
	$('#orderTableBody').empty();

	orders.sort((a, b) => {
		var keyA = a.InvoiceNumberPrefix+a.InvoiceNumber;
		var keyB = b.InvoiceNumberPrefix+b.InvoiceNumber;

		if (keyA < keyB) return -1;
		if (keyA > keyB) return 1;
		return 0; 
	});

	orders.forEach(order => {
		$('#orderTableBody').append(buildTableRow(order));
	});
}

function buildTableRow(dbOrder) {
	var order = dbOrder.cartOrder;
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