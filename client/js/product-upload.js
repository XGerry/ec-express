var socket = io();
var newItems = [];

$(document).ready(function() {
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

	$('#saveItemsButton').click(e => {
		socket.emit('createItems', newItems, responses => {
			console.log(responses);
		});
	});

	$('#saveToSiteButton').click(e => {
		socket.emit('createItemsIn3DCart', newItems, responses => {
			console.log(responses);
		});
	});

	$('#saveToQuickbooksButton').click(e => {
		socket.emit('createItemsInQuickbooks', newItems, responses => {
			console.log(responses);
		});
	});
});

function loadFromTemplate(data) {
	console.log(data);
	data = data.filter(d => {
		return d.sku != '' && d.sku != undefined;
	});
	newItems = data;
	$('#productInfo').text('Found ' + data.length + ' items in the file. Use the button below to send the items to 3D Cart and Quickbooks.');
	$('#sendCard').show();
	if (newItems.length > 0) {
		$('#saveItemsButton').removeClass('disabled');
	}
}