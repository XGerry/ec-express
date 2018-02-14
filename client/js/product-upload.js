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