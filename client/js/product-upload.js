var socket = io();

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
});

function loadFromTemplate(data) {
	console.log(data);
	data = data.filter(d => {
		d.sku != '' && d.sku != undefined
	});
	$('#productInfo').text('Found ' + data.length + ' items in the file. Use the button below to send the items to 3D Cart and Quickbooks.');
	$('#sendCard').show();
}