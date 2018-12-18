var async = require('async');

function randomNumber(min, max) {
  return Math.random() * (max - min) + min;
}

function httpRequest(item, callback) {
  setTimeout(function() {
    callback(null, item);
  }, randomNumber(50, 2000));
}

function httpRequestPromise(item) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(item);
    }, randomNumber(50, 2000));
  });
}

function wait(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, time);
  });
}

let requests = [1, 2, 3, 4, 5, 6];

// send 2 requests every second
async function sendRequestsPromise(requests) {
  var promises = [];
  while (requests.length > 0) {
    console.log('sent a http request');
    promises.push(httpRequestPromise(requests.pop()));
    console.log('sent a http request');
    promises.push(httpRequestPromise(requests.pop()));
    await wait(1000);
  }

  return Promise.all(promises);
}

// sendRequestsPromise(requests).then(results => {
//  console.log('Done all requests');
//  console.log(results);
// });

function sendRequestsCallback(requests, finalCallback) {
  async.mapLimit(requests, 2, function(item, callback) {
    function doRequest() {
      console.log('sent an http request');
      httpRequest(item, function(err, result) {
        if (err) {
          callback(err);
        } else {
          callback(null, result);
        }
      });
    }

    setTimeout(doRequest, 1000);
  }, finalCallback);
}

sendRequestsCallback(requests, function(err, results) {
  console.log('Done all requests');
  console.log(results);
});