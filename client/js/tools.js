var socket = io();
var existingItems = [];
var nonExistingItems = [];

$(document).ready(function() {
	$('#allSKUsFile').on('change', e => {
		console.log('file change');

		$('#allSKUsFile').parse({
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

	$('#unhideProductsButton').click(() => {
		existingItems.forEach((item) => {
			item.hidden = false;
		});
		socket.emit('bulkSaveItems', existingItems);
	});

	$('#replacePricingButton').click(() => {
		var confirmation = confirm('Are you sure? Like, really, really sure?');
		if (confirmation) {
			socket.emit('updatePricingInQB');
			$('#pricingInfo').text('This is going to take a while...');
		} else {
			$('#pricingInfo').text('Didn\'t think so...');
		}
	});

	$('#importOrdersButton').click(e => {
		socket.emit('getOrders');
	});

	$('#getItemsFromQB').click(e => {
		alert('Please wait for the web connector to run. When it has finished, your file will automatically download.');
		socket.emit('findInQuickbooks', nonExistingItems, result => {
			console.log(result);
			var csv = 'sku,description,stock,us_cost,us_price,active\n';
			result.ItemInventoryRet.forEach(item => {
				var line = item.Name + ',"' + item.SalesDesc + '",' + item.QuantityOnHand + ',' + item.SalesPrice + ',' + item.PurchaseCose + ',' + item.IsActive + '\n';
				csv += line;
			});
			csv = 'data:/text/csv;charset=utf-8,' + csv;			
			console.log(csv);
			var data = encodeURI(csv);
			var link = document.createElement('a');
			link.setAttribute('href', data);
			link.setAttribute('download', 'item_list.csv');
			link.click();
		});
	});

	$('#closeSalesOrderButton').click(e => {
		var orderId = $('#salesOrderNumber').val();
		console.log(orderId);
		socket.emit('closeSalesOrder', orderId);
	});
});

function loadFromTemplate(data) {
	console.log(data);
	data = data.filter(d => {
		return d.sku != '' && d.sku != undefined
	});
	console.log(data);
	var skus = data.map(d => {
		return d.sku;
	});
	console.log(skus);
	$('#productInfo').text('Found ' + data.length + ' items in the file. Checking which ones already exist...');
	socket.emit('searchDB', { sku: {$in: skus} }, items => {
		console.log(items);
		$('#existingItemsInfo').text(items.length + ' items already exist on 3D Cart.');
		existingItems = items;
		$('#unhideProductsButton').removeClass('disabled');
		nonExistingItems = skus.filter(i => {
			for (var item of items) {
				if (i == item.sku)
					return false;
			}
			return true;
		});
		$('#nonExistingItemsInfo').text(nonExistingItems.length + ' items do not exist on 3D Cart.');
		if (nonExistingItems.length > 0)
			$('#getItemsFromQB').removeClass('disabled');
		console.log(nonExistingItems);
	});
}