import { Service } from "./beocreate-connect";
import { refreshProducts, setProductInfo } from "./utils";
import { fetch } from 'cross-fetch';
import { BrowserWindow } from "electron";
import { Browser, tcp } from "dnssd2";

export let manuallyDiscoveredProduct: Service | null = null;
let manualDiscoveryInterval: NodeJS.Timer | null = null;
let manualDiscoveryAddress = "10.0.0.1";

let bonjourProductCount = 0;

// FIND BEOCREATE SYSTEMS
export let browser: {
	on: (eventName: string, callback: (service: Service) => void) => void;
	start: () => void;
	stop: () => void;
	list: () => Service[];
} | null = null;
let startedOnce = false;

export function startDiscovery(win: BrowserWindow | null, once?: boolean) { // Start or restart discovery.
	if (!once || !startedOnce) {
	  	if (!browser) {
		  	browser = new Browser(tcp('beocreate'), {maintain: true});
	
	  		browser?.on('serviceUp', service => discoveryEvent("up", service, win));
	  		browser?.on('serviceDown', service => discoveryEvent("down", service, win));
	  		browser?.on('serviceChanged', service => discoveryEvent("changed", service, win));
	  		browser?.on('error', error => console.log("dnssd error: "+error));
	  	} else {
	  		stopDiscovery();
	  	}

	  	console.log("Starting discovery.");
		browser?.start();
		bonjourProductCount = 0;
		startedOnce = true;
  }
}

export function stopDiscovery(win?: BrowserWindow | null) {
	if(!browser) { return; }

	browser.stop();
	products = {};
	bonjourProductCount = 0;

	console.log("Stopping discovery.");

	if (win) {
		win.webContents.send('discoveredProducts', products);
	}
}

export let products: Record<string, Service> = {};

function discoveryEvent(event: string, service: Service, win: BrowserWindow | null): void {
	if (true) {
		console.log(event, new Date(Date.now()).toLocaleString(), service.fullname, service.addresses, service.txt);
	}
	
	if (event == "up" || event == "down") {
		const list = browser?.list() ?? [];

		if (list && win) {
			refreshProducts(win, list);
		}

		bonjourProductCount = list ? list.length : 0;
	}
	
	if (event == "changed") {
		if (products[service.fullname]) {
			setProductInfo(service);
			win?.webContents.send('updateProduct', products[service.fullname]);
		}
	}
}

async function performNetworkDiscovery(address: string, win: BrowserWindow) {
	try {
		const discovery = await fetch('http://'+address+'/product-information/discovery');
		if(discovery.ok) {
			const body = await discovery.json();
			const service = {
				name: body.name, 
				fullname: body.name+"._"+body.serviceType+"._tcp.local.", 
				port: body.advertisePort, 
				addresses: [address], 
				host: address, 
				txt: body.txtRecord, 
				manual: true
			};

			if (!manuallyDiscoveredProduct) {
				manuallyDiscoveredProduct = service;
				refreshProducts(win!);
			}
		} else {
			if (manuallyDiscoveredProduct != null) {
				manuallyDiscoveredProduct = null;
				refreshProducts(win!);
			}
		}
	} catch (err) {
		console.error("Manual product discovery unsuccessful", err instanceof Error ? err.message : err);
	}
}

async function discoverProductAtAddress(address: string, win: BrowserWindow | null): Promise<void> {
	if(bonjourProductCount === 0 && win) {
		performNetworkDiscovery(address, win);
		return;
	}

	if(manuallyDiscoveredProduct === null) { return; }

	manuallyDiscoveredProduct = null;
	refreshProducts(win!);
}

export function startManualDiscovery(win: BrowserWindow | null): void {
	manuallyDiscoveredProduct = null;

	stopManualDiscovery();

	discoverProductAtAddress(manualDiscoveryAddress, win);
	manualDiscoveryInterval = setInterval(function() {
		discoverProductAtAddress(manualDiscoveryAddress, win);
	}, 10000);
}

export function stopManualDiscovery(): void {
	if(!manualDiscoveryInterval) {
		return;
	}

	clearInterval(manualDiscoveryInterval);
}