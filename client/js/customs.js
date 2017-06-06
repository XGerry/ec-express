$(document).ready(function() {
	$('#generateRequest').click(function(e) {
		var start = $('#startDate').val();
		var end = $('#endDate').val();
		$.get('/api/invoices', {
			'startDate': start,
			'endDate': end
		}).done(function(result) {
				console.log(result);
		});
	});

	$('#generateRequestForItems').click(function(e) {
		$.get('/api/items', function(invoices) {
			console.log(invoices);
		});
	});

	$('#generateManifest').click(function(e) {
		$.get('/api/generate/manifest', function(manifest) {
			console.log(manifest);
		});
	});

});