var socket = io();
var items = [];
var customer = {};

$(document).ready(e => {
	$('#fileInput').on('change', e => {
		console.log('file change');
		$('#fileName').text(e.target.files[0].name);

		$('#fileInput').parse({
			config: {
				complete: function(results, file) {
					console.log(results);
				},
				header: true
			},
			complete: function() {
				console.log('all files done');
			}
		});
	});
});

