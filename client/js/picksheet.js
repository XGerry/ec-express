$(document).ready(e => {
});

function buildPickTable(order) {
	console.log(order);
	var totalItems = 0;
	order.OrderItemList.forEach(item => {
		var row = $('<tr></tr>');
		var locationCol = $('<td></td>');
		locationCol.text(item.ItemWarehouseLocation); 
		var skuCol = $('<td></td>');
		skuCol.text(item.ItemID); 
		var descriptionCol = $('<td></td>');
		descriptionCol.text(item.ItemDescription);
		var orderQuantityCol = $('<td></td>');
		orderQuantityCol.text(item.ItemQuantity);
		totalItems += parseInt(item.ItemQuantity);
		var pickQuantityCol = $('<td></td>');
		pickQuantityCol.text('');
		var stockCol = $('<td></td>');
		stockCol.text(item.ItemUnitStock);

		var pickedCol = $('<td></td>');
		pickedCol.append($('<input type="checkbox" style="width:15px;height:15px;margin:0;">'));

		row.append(locationCol);
		row.append(skuCol);
		row.append(orderQuantityCol);
		row.append(pickedCol);
		row.append(pickQuantityCol);
		row.append(descriptionCol);
		row.append(stockCol);

		$('#pickTableBody'+order.InvoiceNumberPrefix+order.InvoiceNumber).append(row);
	});

	$('#totalItems'+order.InvoiceNumberPrefix+order.InvoiceNumber).text(totalItems);

	$('#pickTable'+order.InvoiceNumberPrefix+order.InvoiceNumber).DataTable({
		bDestroy: true,
		order: [[0, 'asc']],
		paging: false,
		searching: false,
		columnDefs: [{
			className: 'dt-center',
			targets: [2,3]
		}, {
			width: '15%',
			targets: 0
		}]
	});
}

function buildPickTables(orders) {
	orders.forEach(order => {
		buildPickTable(order);
	});
	window.print();
}