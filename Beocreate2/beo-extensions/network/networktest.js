process.env.NODE_PATH = "/usr/lib/node_modules/";
import Module from 'module';
Module._initPaths();

import networkCore from '/opt/beocreate/beocreate_essentials/networking';
import {iwconfig, ifconfig} from 'wireless-tools';

/*networkCore.getWifiStatus(function(status, error) {
	console.log("Status of Wi-Fi connection:", status, "Errors:", error);
});*/

ifconfig.up({interface: 'wlan0'}, function(err) {
	if (err) {
		// The system has no Wi-Fi capabilities.
		console.error(err);
	} else {
		console.log("wlan0 on.");
	}
});
