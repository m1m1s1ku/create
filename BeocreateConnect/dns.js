import MDNS from 'multicast-dns';

const mdns = MDNS();

mdns.on('response', function (response) {
	console.log(response);
});
setTimeout(function() {
	mdns.query({ questions:[{ name: 'Beocreate-4-Encore.local', type: 'A' }] });
}, 1000);
