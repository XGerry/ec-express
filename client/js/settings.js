$(document).ready(function() {
	$.get('api/settings', function(response) {
		if (response.companyFile) {
			$('#company-file').text(response.companyFile);
		}
	});
});