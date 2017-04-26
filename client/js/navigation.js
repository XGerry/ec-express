$(function() {
	/*
	var activePage = $('#nav-list').attr('active');
	var home = $('<li></li>').append($('<a href="#"></a>').text('Home'));
	var customs = $('<li></li>').append($('<a href="#"></a>').text('Customs'));
	var upload = $('<li></li>').append($('<a href="/product-upload.html"></a>').text('Product Upload'));
	var orders = $('<li></li>').append($('<a href="/orders.html"></a>').text('Order Sync'));

	var activeTab = home; // default
	switch (activePage) {
		case 'home':
			activeTab = home;
			break;
		case 'customs':
			activeTab = customs;
			break;
		case 'upload':
			activeTab = upload;
			break;
		case 'orders':
			activeTab = orders;
			break;
		default:
			activeTab = home;
			break;
	}
	activeTab.addClass('active');

	$('#nav-list').append(home);
	$('#nav-list').append(customs);
	$('#nav-list').append(upload);
	$('#nav-list').append(orders);
	*/

    // <a href="/login" class="btn btn-primary navbar-btn">Sign in</a>
    $.get('/user').done(function(response) {
	    var rightNav;
    	if (!$.trim(response)) {
    		// show the login button
    		rightNav = $('<a href="/login"></a>').addClass('btn btn-primary navbar-btn').text('Sign in');
    	} else {
    		rightNav = $('<p></p>').addClass('navbar-text').text(response.email);
    	}
    	$('#nav-right').append(rightNav);
    });
});