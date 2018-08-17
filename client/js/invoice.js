var socket = io();
var order;

$(document).ready(e => {
	$('#saveToQuickbooks').click(e => {
		e.preventDefault();
		getInvoicedItems();
		console.log(order);
		socket.emit('createInvoice', order);
	});

	$('#saveToSiteButton').click(e => {
		e.preventDefault();
		getInvoicedItems();
		socket.emit('saveOrder', order, response => {
			console.log(response);
		});
	});
});


function buildPickTable(order) {
	console.log(order);
	this.order = order;
	var totalItems = 0;
	order.OrderItemList.forEach(item => {
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
		var pickedQuantity = $('<input type="number" class="form-control item-field" sku="'+item.ItemID+'">');
		pickedQuantity.val(item.ItemQuantity);
		pickedCol.append(pickedQuantity);

		row.append(locationCol);
		row.append(skuCol);
		row.append(orderQuantityCol);
		row.append(pickedCol);
		row.append(descriptionCol);
		row.append(stockCol);

		$('#pickTableBody'+order.InvoiceNumberPrefix+order.InvoiceNumber).append(row);
	});

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

	$('#linkTo3DCart').prop('href', getURLFromOrder(order));

	var pickTable = $('#pickTable'+order.InvoiceNumberPrefix+order.InvoiceNumber).DataTable({
		bDestroy: true,
		order: [[0, 'asc']],
		paging: false,
		searching: false,
		autoWidth: false,
		columnDefs: [{
			className: 'dt-center',
			targets: [2,3]
		}]
	});
}

function buildPickTables(orders) {
	orders.forEach(order => {
		buildPickTable(order);
	});
	window.print();
}

function getURLFromOrder(order) {
	var url = 'https://www.ecstasycrafts.';
	url += order.InvoiceNumberPrefix == 'CA-' ? 'ca' : 'com';
	url += '/admin/order_details.asp?orderid=' + order.OrderID;
	return url;
}

function getInvoicedItems() {
	$('.item-field').each((i, elem) => {
		var sku = $(elem).attr('sku');
		var quantity = $(elem).val();
		for (item of order.OrderItemList) {
			if (item.ItemID == sku) {
				item.quantityPicked = parseInt(quantity);
				item.picked = true;
				break;
			}
		}
	});

	order.ShipmentList[0].ShipmentCost = $('#shippingCost').val();
}