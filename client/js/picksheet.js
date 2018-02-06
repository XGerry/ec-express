var theOrder = {};

$(document).ready(e => {
	$('#pickTable').DataTable({
		bDestroy: true,
		order: [[0, 'asc']]
	});
});

function buildPickTable(order) {
	console.log('building pick table');
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
		var pickQuantityCol = $('<td></td>');
		pickQuantityCol.text('0');
		var stockCol = $('<td></td>');
		stockCol.text(item.ItemUnitStock);

		row.append(locationCol);
		row.append(skuCol);
		row.append(descriptionCol);
		row.append(orderQuantityCol);
		row.append(pickQuantityCol);
		row.append(stockCol);

		$('#pickTableBody').append(row);
	});

	$('#pickTable').DataTable({
		bDestroy: true,
		order: [[0, 'asc']]
	});
}