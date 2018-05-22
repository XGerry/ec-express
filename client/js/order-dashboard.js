var socket = io();
var progress = 0;
var ordersToScan = [];

$(document).ready(e => {
	var query = {
		orderstatus: 1, // New
		limit: 200
	};

	socket.emit('loadOrders', query, null, orders => {
		buildSummaryTable('#newSummaryTable', orders);
		showProgress();
		$('#newCardFooter').text(orders.length + ' new orders.');
		scanForDuplicates(orders);
	});

	query.orderstatus = 2; // Processing
	socket.emit('loadOrders', query, null, orders => {
		buildSummaryTable('#processingSummaryTable', orders);
		showProgress();
		$('#processingCardFooter').text(orders.length + ' orders waiting to be picked.');
		scanForDuplicates(orders);
	});

	query.orderstatus = 3; // Backorder
	socket.emit('loadOrders', query, null, orders => {
		buildSummaryTable('#backorderSummaryTable', orders);
		showProgress();
		$('#backorderCardFooter').text(orders.length + ' orders in backorder.');
		scanForDuplicates(orders);
	});

	query.orderstatus = 6; // Preorder
	socket.emit('loadOrders', query, null, orders => {
		buildSummaryTable('#preorderSummaryTable', orders);
		showProgress();
		$('#preorderCardFooter').text(orders.length + ' orders in preorder.');
		scanForDuplicates(orders);
	});

	query.orderstatus = 9; // Processing Payment
	socket.emit('loadOrders', query, null, orders => {
		buildSummaryTable('#paymentSummaryTable', orders);
		showProgress();
		$('#paymentCardFooter').text(orders.length + ' orders need invoicing.');
	});

	query.orderstatus = 13; // Awaiting Shipment
	socket.emit('loadOrders', query, null, orders => {
		buildSummaryTable('#shipmentSummaryTable', orders);
		showProgress();
		$('#shipmentCardFooter').text(orders.length + ' orders waiting to be shipped.');
	});
});

function showProgress() {
	progress++;
	var percentage = (progress / 6) * 100; // the number of requests we need to do
	$('#summaryProgress').css('width', percentage + '%');
	if (progress == 6) {
		$('#summaryProgress').removeClass('progress-bar-animated');
	}
}

function buildSummaryTable(tableId, orders) {
	orders.sort((a, b) => {
		var aDate = moment(a.OrderDate);
		var bDate = moment(b.OrderDate);
		if (aDate.isBefore(bDate)) {
			return -1;
		} else if (aDate.isAfter(bDate)) {
			return 1;
		} else {
			return 0;
		}
	});
	$(''+tableId).empty();
	orders.forEach(order => {
		var row = $('<tr></tr>');
		var id = $('<td></td>').text(order.InvoiceNumberPrefix + order.InvoiceNumber);
		var name = $('<td></td>').text(order.BillingFirstName + ' ' + order.BillingLastName);
		//var amount = $('<td></td>').text('$' + order.OrderAmount.toFixed(2));
		var date = $('<td></td>').text(moment(order.OrderDate).format('MMM Do'));
		row.append(id);
		row.append(name);
		//row.append(amount);
		row.append(date);
		$(''+tableId).append(row);

		row.click(e => {
			var url = getURLFromOrder(order);
			window.open(url, '_blank');
		});
	});
}

function scanForDuplicates(orders) {
	ordersToScan = ordersToScan.concat(orders);
	var duplicates = {};
	for (var i = 0; i < ordersToScan.length; i++) {
		for (var j = 0; j < ordersToScan.length; j++) {
			if (ordersToScan[i].BillingEmail == ordersToScan[j].BillingEmail && i != j) {
				if (duplicates.hasOwnProperty(ordersToScan[j].BillingEmail)) {
					var dup = false;
					duplicates[ordersToScan[j].BillingEmail].forEach(previousOrder => {
						if (previousOrder.InvoiceNumber == ordersToScan[j].InvoiceNumber) {
							dup = true;
						}
					});
					if (!dup) {
						duplicates[ordersToScan[j].BillingEmail].push(ordersToScan[j]);
					}
				} else {
					duplicates[ordersToScan[j].BillingEmail] = [ordersToScan[j]];
				}
			}
		}
	}
	buildMultipleOrdersTable(duplicates);
}

function buildMultipleOrdersTable(duplicates) {
	$('#multipleOrderSummary').empty();
	$.each(duplicates, (key, arr) => {
		var row = $('<div class="row"></div>');
		var title = $('<h5></h5>').text(arr[0].BillingFirstName + ' ' + arr[0].BillingLastName);
		var table = $('<table class="table table-sm table-hover"></table>');
		var thead = $('<thead></thead>');
		var headRow = $('<tr></tr>');
		headRow.append($('<th></th>').text('ID'));
		headRow.append($('<th></th>').text('Status'));
		headRow.append($('<th></th>').text('Date'));
		
		var tbody = $('<tbody></tbody>');
		arr.forEach(order => {
			var tableRow = $('<tr></tr>');
			var orderId = $('<td></td>').text(order.InvoiceNumberPrefix + order.InvoiceNumber);
			var status;
			switch (order.OrderStatusID) {
				case 1:
					status = $('<td></td>').text('New');
					break;
				case 2:
					status = $('<td></td>').text('Processing');
					break;
				case 3:
					status = $('<td></td>').text('Backorder');
					break;
				case 6:
					status = $('<td></td>').text('Preorder');
					break;
				default:
					status = $('<td></td>').text('Unknown');
			}
			var date = $('<td></td>').text(moment(order.OrderDate).format('MMM Do'));

			tableRow.append(orderId);
			tableRow.append(status);
			tableRow.append(date);
			tbody.append(tableRow);

			tableRow.click(e => {
				window.open(getURLFromOrder(order), '_blank');
			});
		});

		thead.append(headRow);
		table.append(thead);
		table.append(tbody);
		row.append(title);
		row.append(table);
		$('#multipleOrderSummary').append(row);
	});

	$('#multipleOrderFooter').text(Object.keys(duplicates).length + ' customers with more than one order');
}

function getURLFromOrder(order) {
	var url = 'https://www.ecstasycrafts.';
	url += order.InvoiceNumberPrefix == 'CA-' ? 'ca' : 'com';
	url += '/admin/order_details.asp?orderid=' + order.OrderID;
	return url;
}